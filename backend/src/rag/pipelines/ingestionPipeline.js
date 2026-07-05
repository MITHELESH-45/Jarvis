const { DocumentLoaderRouter } = require("../services/loader/documentLoader.js");
const { DocumentCleaner } = require("../services/cleaner/documentCleaner.js");
const { DocumentParser } = require("../services/parser/documentParser.js");
const { HierarchicalChunker } = require("../services/chunker/hierarchicalChunker.js");
const { MetadataEnricher } = require("../services/enricher/metadataEnricher.js");
const { GeminiEmbedder } = require("../services/embedder/geminiEmbedder.js");
const { PineconeVectorStore } = require("../services/vectorstore/pineconeVectorStore.js");
const { logger } = require("../logger/index.js");
const { elapsedSeconds } = require("../utils/index.js");

/**
 * IngestionPipeline — top-level orchestrator.
 *
 * Wires all 7 services and drives the ingestion flow:
 *   Load → Clean → Parse → Chunk → Enrich → Embed → Upsert
 *
 * Accepts one or more file paths.
 * Supports re-indexing (delete-before-upsert) via the `reindex` option.
 */
class IngestionPipeline {
  constructor(config) {
    this.config = config;

    this.loader     = new DocumentLoaderRouter();
    this.cleaner    = new DocumentCleaner();
    this.parser     = new DocumentParser();
    this.chunker    = new HierarchicalChunker({
      maxChunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
    });
    this.enricher   = new MetadataEnricher();
    this.embedder   = new GeminiEmbedder({
      apiKey:             config.geminiApiKey,
      batchSize:          config.embeddingBatchSize,
      interBatchDelayMs:  config.interBatchDelayMs,
      maxRetries:         config.maxRetries,
      retryDelayMs:       config.retryDelayMs,
    });
    this.vectorStore = new PineconeVectorStore({
      apiKey:         config.pineconeApiKey,
      indexName:      config.pineconeIndexName,
      upsertBatchSize: config.upsertBatchSize,
      maxRetries:     config.maxRetries,
      retryDelayMs:   config.retryDelayMs,
    });
  }

  async run(filePaths, options = {}) {
    const startMs = Date.now();
    const errors  = [];
    const result  = {
      documentsLoaded:    0,
      pagesProcessed:     0,
      sectionsDetected:   0,
      chunksCreated:      0,
      embeddingsGenerated: 0,
      vectorsUploaded:    0,
      durationSeconds:    0,
      errors,
      success: false,
    };

    logger.separator();
    logger.info(`Starting ingestion pipeline for ${filePaths.length} file(s)`);
    logger.info(
      `Config: chunkSize=${this.config.chunkSize}, overlap=${this.config.chunkOverlap}, embeddingBatch=${this.config.embeddingBatchSize}`
    );
    logger.separator();

    try {
      // ─── STAGE 1 — Document Loading ──────────────────────────────────────
      logger.info("STAGE 1 — Loading documents...");
      const rawDocs = [];

      for (const filePath of filePaths) {
        try {
          const pages = await this.loader.load(filePath);
          rawDocs.push(...pages);
          result.documentsLoaded++;
        } catch (err) {
          const msg = `Failed to load "${filePath}": ${err.message}`;
          logger.error(msg);
          errors.push(msg);
        }
      }

      result.pagesProcessed = rawDocs.length;
      logger.info(`Stage 1 complete — ${result.documentsLoaded} documents, ${result.pagesProcessed} pages`);

      if (rawDocs.length === 0) throw new Error("No documents loaded. Aborting pipeline.");

      // ─── STAGE 2 — Document Cleaning ──────────────────────────────────────
      logger.info("STAGE 2 — Cleaning documents...");
      const cleanedDocs = this.cleaner.cleanBatch(rawDocs);
      logger.info(`Stage 2 complete — ${cleanedDocs.length} pages cleaned`);

      // ─── STAGE 3 — Structural Parsing ────────────────────────────────────
      logger.info("STAGE 3 — Parsing document structure...");
      const sections = this.parser.parse(cleanedDocs);
      result.sectionsDetected = sections.length;
      logger.info(`Stage 3 complete — ${sections.length} top-level sections detected`);
      sections.forEach((s) =>
        logger.debug(`  Section: "${s.title}" (${s.sectionType}) — ${s.subsections.length} subsections`)
      );

      // ─── STAGE 4 — Chunking ───────────────────────────────────────────────
      logger.info("STAGE 4 — Building hierarchical chunks...");
      const chunkCandidates = await this.chunker.chunk(sections);
      result.chunksCreated = chunkCandidates.length;
      const fallbackCount = chunkCandidates.filter((c) => c.isSplit).length;
      logger.info(`Stage 4 complete — ${chunkCandidates.length} chunks (${fallbackCount} fallback splits)`);

      // ─── STAGE 5 — Metadata Enrichment ───────────────────────────────────
      logger.info("STAGE 5 — Enriching chunk metadata...");
      const enrichedChunks = this.enricher.enrich(chunkCandidates);
      logger.info(`Stage 5 complete — ${enrichedChunks.length} chunks enriched`);

      // ─── Re-index: delete stale vectors before upsert ────────────────────
      if (options.reindex) {
        logger.info("Re-index mode: deleting existing vectors...");
        const docIds = [...new Set(enrichedChunks.map((c) => c.metadata.document_id))];
        for (const docId of docIds) {
          try {
            await this.vectorStore.deleteByDocumentId(docId);
          } catch (err) {
            const msg = `Failed to delete vectors for ${docId}: ${err.message}`;
            logger.warn(msg);
            errors.push(msg);
          }
        }
      }

      // ─── STAGE 6 — Embedding ──────────────────────────────────────────────
      logger.info("STAGE 6 — Generating Gemini embeddings...");
      const embeddedChunks = await this.embedder.embedBatch(enrichedChunks);
      result.embeddingsGenerated = embeddedChunks.length;
      logger.info(`Stage 6 complete — ${embeddedChunks.length} embeddings generated`);

      // ─── STAGE 7 — Pinecone Upload ────────────────────────────────────────
      logger.info("STAGE 7 — Uploading to Pinecone...");
      const pineconeRecords = this.vectorStore.buildRecords(embeddedChunks);
      await this.vectorStore.upsert(pineconeRecords);
      result.vectorsUploaded = pineconeRecords.length;
      logger.info(`Stage 7 complete — ${pineconeRecords.length} vectors stored in Pinecone`);

      result.success = true;
    } catch (err) {
      const msg = `Pipeline fatal error: ${err.message}`;
      logger.error(msg);
      errors.push(msg);
      result.success = false;
    }

    result.durationSeconds = elapsedSeconds(startMs);
    logger.summary(result);

    return result;
  }
}

module.exports = { IngestionPipeline };
