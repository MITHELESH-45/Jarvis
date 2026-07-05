const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { chunkArray, sleep } = require("../../utils/index.js");
const { logger } = require("../../logger/index.js");

/**
 * Stage 6 — Gemini Embeddings Service.
 *
 * Free-tier quota: 100 embed_content requests per minute.
 * Each document in a batch counts as ONE request.
 * With batch size 5 and 13s inter-batch delay → ~23 batches/min → 115 req/min safe.
 *
 * Rate-limit handling:
 * - Parses the exact retryDelay from the 429 error body ("Please retry in Xs")
 * - Waits the API-specified delay before retrying (not a fixed backoff)
 * - Falls back to exponential backoff for non-rate-limit errors
 *
 * Validation:
 * - Validates every embedding after each batch returns
 * - Re-embeds any chunk that got an empty [] from LangChain's allSettled handling
 * - Logs every failure with full detail — nothing is silently dropped
 */
class GeminiEmbedder {
  constructor({ apiKey, batchSize, interBatchDelayMs, maxRetries, retryDelayMs }) {
    this.batchSize = batchSize;
    this.interBatchDelayMs = interBatchDelayMs;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: "gemini-embedding-001",
    });
  }

  /**
   * Parses the retry delay (in ms) from a Gemini 429 error message.
   * The API embeds it as "Please retry in 50.13s" or "retryDelay: \"50s\"".
   * Returns null if not found.
   */
  _parseRetryDelay(errorMessage) {
    const msg = String(errorMessage);

    // Pattern: "Please retry in 50.135463367s"
    const retryMatch = msg.match(/Please retry in ([\d.]+)s/i);
    if (retryMatch) {
      return Math.ceil(parseFloat(retryMatch[1]) * 1000) + 2000; // add 2s buffer
    }

    // Pattern: "retryDelay":"50s"
    const jsonMatch = msg.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    if (jsonMatch) {
      return Math.ceil(parseFloat(jsonMatch[1]) * 1000) + 2000;
    }

    return null;
  }

  _isRateLimit(error) {
    const msg = String(error.message).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("quota") ||
      msg.includes("too many requests")
    );
  }

  _isValidEmbedding(embedding) {
    return (
      Array.isArray(embedding) &&
      embedding.length > 0 &&
      typeof embedding[0] === "number" &&
      isFinite(embedding[0])
    );
  }

  async embedBatch(chunks) {
    const batches = chunkArray(chunks, this.batchSize);
    const results = [];
    const skipped = [];

    logger.info(
      `Starting embedding: ${chunks.length} chunks in ${batches.length} batches ` +
      `(size=${this.batchSize}, inter-batch delay=${this.interBatchDelayMs}ms)`
    );

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchLabel = `Batch ${i + 1}/${batches.length}`;

      // ── Embed with retry ────────────────────────────────────────────────
      let batchResults = null;
      let batchFailed = false;

      for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
        try {
          batchResults = await this._embedSingleBatch(batch);
          break; // success
        } catch (err) {
          const isQuota = this._isRateLimit(err);
          const apiDelay = this._parseRetryDelay(err.message);
          const waitMs = apiDelay ?? (this.retryDelayMs * Math.pow(2, attempt - 1));

          if (attempt > this.maxRetries) {
            logger.error(`${batchLabel} permanently failed after ${this.maxRetries + 1} attempts: ${err.message}`);
            batchFailed = true;
            break;
          }

          logger.warn(
            `${batchLabel} attempt ${attempt} failed (${isQuota ? "RATE LIMIT" : "ERROR"}). ` +
            `Waiting ${(waitMs / 1000).toFixed(1)}s before retry...`,
            { error: err.message.slice(0, 120) }
          );
          await sleep(waitMs);
        }
      }

      if (batchFailed) {
        for (const chunk of batch) {
          logger.error(`Chunk in failed batch — id="${chunk.chunkId}" | section="${chunk.metadata?.section}"`);
          skipped.push(chunk);
        }
        // Still apply inter-batch delay even after failure
        if (i < batches.length - 1) await sleep(this.interBatchDelayMs);
        continue;
      }

      // ── Validate each returned embedding ────────────────────────────────
      const valid = [];
      const needsRetry = [];

      for (const item of batchResults) {
        if (this._isValidEmbedding(item.embedding)) {
          valid.push(item);
        } else {
          needsRetry.push(item.chunk);
        }
      }

      results.push(...valid);

      // ── Re-embed individually any that came back empty ──────────────────
      if (needsRetry.length > 0) {
        logger.warn(
          `${batchLabel} — ${needsRetry.length} chunk(s) had empty embeddings. Re-embedding individually...`
        );

        for (const chunk of needsRetry) {
          const recovered = await this._embedSingleChunk(chunk, batchLabel);
          if (recovered) {
            results.push(recovered);
            logger.info(`  Re-embed OK: "${chunk.chunkId}" (section: "${chunk.metadata?.section}")`);
          } else {
            skipped.push(chunk);
            logger.error(
              `  Re-embed FAILED — chunk will be SKIPPED:\n` +
              `    id="${chunk.chunkId}" | section="${chunk.metadata?.section}" | ` +
              `page=${chunk.metadata?.page_number} | content_length=${chunk.content?.length}\n` +
              `    preview="${String(chunk.content ?? "").slice(0, 100)}"`
            );
          }
        }
      }

      const validCount = valid.length + (needsRetry.length - (needsRetry.length - results.length + valid.length));
      logger.info(`${batchLabel} — complete (${results.length} total valid so far)`);

      // ── Throttle: wait between batches to respect RPM quota ─────────────
      if (i < batches.length - 1) {
        logger.info(`Waiting ${(this.interBatchDelayMs / 1000).toFixed(0)}s before next batch (rate limit buffer)...`);
        await sleep(this.interBatchDelayMs);
      }
    }

    // ── Final report ────────────────────────────────────────────────────────
    logger.info(
      `\nEmbedding complete:\n` +
      `  Input chunks     : ${chunks.length}\n` +
      `  Valid embeddings : ${results.length}\n` +
      `  Skipped          : ${skipped.length}`
    );

    if (skipped.length > 0) {
      logger.warn(`${skipped.length} chunk(s) permanently skipped (could not be embedded):`);
      skipped.forEach((c, idx) => {
        logger.warn(`  [${idx + 1}] id="${c.chunkId}" | section="${c.metadata?.section}"`);
      });
    }

    return results;
  }

  async _embedSingleBatch(batch) {
    const texts = batch.map((chunk) => chunk.content);
    const vectors = await this.embeddings.embedDocuments(texts);

    if (vectors.length !== texts.length) {
      logger.warn(`Vector count mismatch: sent ${texts.length}, received ${vectors.length}`);
    }

    return batch.map((chunk, i) => ({
      chunk,
      embedding: vectors[i] ?? [],
    }));
  }

  /**
   * Recovery path: embed one chunk at a time with full rate-limit awareness.
   */
  async _embedSingleChunk(chunk, contextLabel) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const vector = await this.embeddings.embedQuery(chunk.content);
        if (this._isValidEmbedding(vector)) {
          return { chunk, embedding: vector };
        }
        logger.warn(`${contextLabel} single-embed attempt ${attempt}: invalid vector returned`);
      } catch (err) {
        const isQuota = this._isRateLimit(err);
        const apiDelay = this._parseRetryDelay(err.message);
        const waitMs = apiDelay ?? (this.retryDelayMs * Math.pow(2, attempt));

        logger.warn(
          `${contextLabel} single-embed attempt ${attempt} ${isQuota ? "(RATE LIMIT)" : "(ERROR)"}: ` +
          `${err.message.slice(0, 80)}. ` +
          `Waiting ${(waitMs / 1000).toFixed(1)}s...`
        );

        if (attempt < this.maxRetries) await sleep(waitMs);
      }
    }
    return null;
  }
}

module.exports = { GeminiEmbedder };
