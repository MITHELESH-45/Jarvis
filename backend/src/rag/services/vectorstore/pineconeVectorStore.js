const { Pinecone } = require("@pinecone-database/pinecone");
const { chunkArray, withRetry } = require("../../utils/index.js");
const { logger } = require("../../logger/index.js");

/**
 * Stage 7 — Pinecone Vector Store.
 *
 * Pinecone SDK v8 breaking changes (confirmed from SDK source):
 *   - client.index()  → { name: 'index-name' }  (object, NOT a string)
 *   - index.upsert()  → { records: [...] }        (object with records key, NOT a raw array)
 */
class PineconeVectorStore {
  constructor({ apiKey, indexName, upsertBatchSize, maxRetries, retryDelayMs }) {
    this.indexName = indexName;
    this.upsertBatchSize = upsertBatchSize;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.client = new Pinecone({ apiKey });
  }

  /**
   * Pinecone metadata only accepts: string | number | boolean | string[].
   * Converts anything else to a safe representation.
   */
  _sanitizeMetadata(raw) {
    const safe = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || value === undefined) {
        safe[key] = "";
      } else if (typeof value === "boolean") {
        safe[key] = value;
      } else if (typeof value === "number") {
        safe[key] = isFinite(value) ? value : 0;
      } else if (typeof value === "string") {
        safe[key] = value;
      } else if (Array.isArray(value)) {
        safe[key] = value.map(String);
      } else {
        safe[key] = JSON.stringify(value);
      }
    }
    return safe;
  }

  /**
   * Validates a single embedding before sending to Pinecone.
   * Returns { valid: true, record } or { valid: false, reason }.
   */
  _validateRecord(embeddedChunk, index) {
    const { chunk, embedding } = embeddedChunk;

    if (!chunk) {
      return { valid: false, reason: "chunk object is missing" };
    }
    if (!chunk.chunkId || typeof chunk.chunkId !== "string" || chunk.chunkId.trim() === "") {
      return { valid: false, reason: `chunkId is missing or empty` };
    }
    if (!chunk.content || chunk.content.trim() === "") {
      return { valid: false, reason: "chunk content is empty" };
    }
    if (!Array.isArray(embedding)) {
      return { valid: false, reason: `embedding is not an array (type: ${typeof embedding})` };
    }
    if (embedding.length === 0) {
      return { valid: false, reason: "embedding is an empty array — likely a LangChain batch failure" };
    }
    if (typeof embedding[0] !== "number" || !isFinite(embedding[0])) {
      return { valid: false, reason: `embedding[0] is not a finite number (got: ${embedding[0]})` };
    }

    return {
      valid: true,
      record: {
        id: chunk.chunkId,
        values: embedding,
        metadata: this._sanitizeMetadata({
          ...chunk.metadata,
          text: chunk.content,
        }),
      },
    };
  }

  /**
   * Converts EmbeddedChunks into validated Pinecone v8 records.
   *
   * Every chunk is validated individually.
   * Invalid chunks are logged with full detail — nothing is silently dropped.
   * Returns only valid records (safe to send to Pinecone).
   */
  buildRecords(embeddedChunks) {
    const valid = [];
    const invalid = [];

    for (let i = 0; i < embeddedChunks.length; i++) {
      const result = this._validateRecord(embeddedChunks[i], i);

      if (result.valid) {
        valid.push(result.record);
      } else {
        const { chunk, embedding } = embeddedChunks[i] ?? {};
        invalid.push({
          index: i,
          chunkId: chunk?.chunkId ?? "unknown",
          section: chunk?.metadata?.section ?? "unknown",
          page: chunk?.metadata?.page_number ?? "unknown",
          contentLength: chunk?.content?.length ?? 0,
          embeddingLength: Array.isArray(embedding) ? embedding.length : "not-array",
          preview: String(chunk?.content ?? "").slice(0, 100),
          reason: result.reason,
        });
      }
    }

    // ── Validation report ──────────────────────────────────────────────────
    logger.info(
      `\nPinecone record validation:\n` +
      `  Total embedded chunks : ${embeddedChunks.length}\n` +
      `  Valid records         : ${valid.length}\n` +
      `  Invalid (skipped)     : ${invalid.length}`
    );

    if (invalid.length > 0) {
      logger.warn(`${invalid.length} chunk(s) failed validation and will NOT be uploaded:`);
      invalid.forEach((item) => {
        logger.warn(
          `  [${item.index}] id="${item.chunkId}" | section="${item.section}" | ` +
          `page=${item.page} | content_length=${item.contentLength} | ` +
          `embedding_length=${item.embeddingLength}\n` +
          `        REASON: ${item.reason}\n` +
          `        PREVIEW: "${item.preview}"`
        );
      });
    }

    return valid;
  }

  async upsert(records) {
    if (!records || records.length === 0) {
      logger.warn("upsert called with 0 valid records — skipping Pinecone upload.");
      return;
    }

    // Pinecone v8: client.index({ name }) — NOT client.index('name')
    const index = this.client.index({ name: this.indexName });
    const batches = chunkArray(records, this.upsertBatchSize);
    let uploaded = 0;

    logger.info(
      `Upserting ${records.length} vectors in ${batches.length} batches (size=${this.upsertBatchSize})`
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchLabel = `Upsert batch ${i + 1}/${batches.length}`;

      logger.info(
        `${batchLabel} — ${batch.length} records | ` +
        `first id: "${batch[0]?.id}" | dims: ${batch[0]?.values?.length}`
      );

      await withRetry(
        async () => {
          // Pinecone v8: index.upsert({ records: [...] }) — NOT index.upsert([...])
          await index.upsert({ records: batch });
          uploaded += batch.length;
          logger.info(
            `${batchLabel} — complete (${batch.length} vectors, total: ${uploaded}/${records.length})`
          );
        },
        this.maxRetries,
        this.retryDelayMs,
        batchLabel,
        (attempt, error) => {
          logger.warn(
            `${batchLabel} failed (attempt ${attempt}). Retrying...`,
            { error: error.message }
          );
        }
      );
    }

    logger.info(`All ${records.length} vectors successfully upserted to Pinecone.`);
  }

  async deleteByDocumentId(documentId) {
    const index = this.client.index({ name: this.indexName });
    logger.info(`Deleting vectors for document_id: ${documentId}`);
    try {
      await index.deleteMany({ filter: { document_id: { $eq: documentId } } });
      logger.info(`Deletion complete for document_id: ${documentId}`);
    } catch (err) {
      logger.warn(
        `Could not delete vectors for document_id ${documentId}: ${err.message}. Proceeding (upsert is idempotent).`
      );
    }
  }
}

module.exports = { PineconeVectorStore };
