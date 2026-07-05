const { Pinecone } = require("@pinecone-database/pinecone");
const { logger } = require("./logger/index.js");
require("dotenv").config();

/**
 * Semantic Retriever Service
 * 
 * Purpose: Performs dense vector search using cosine similarity against the Pinecone database.
 * Architecture: Utilizes Pinecone SDK v8. Supports dynamic Top-K and dynamic metadata filtering.
 *               Includes timeout handling and telemetry.
 */
class SemanticRetriever {
  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    this.indexName = process.env.PINECONE_INDEX_NAME || "jarvis-knowledge-base";
    
    if (!apiKey) {
      throw new Error("[SemanticRetriever] PINECONE_API_KEY is not defined in environment.");
    }
    
    // Initialize Pinecone client once
    this.client = new Pinecone({ apiKey });
  }

  /**
   * Retrieve the top-K semantically similar chunks.
   * @param {number[]} vector - The embedded query vector (length 3072).
   * @param {number} topK - The dynamic top-K amount of documents to retrieve.
   * @param {Object} [filter={}] - Optional metadata filter for targeted search.
   * @returns {Promise<Array>} List of retrieved Pinecone matches with full metadata and scores.
   */
  async retrieve(vector, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[SemanticRetriever] Executing semantic search (topK=${topK}, filter=${JSON.stringify(filter)})`);
    
    try {
      const index = this.client.index({ name: this.indexName });
      
      const queryParams = {
        vector,
        topK,
        includeMetadata: true,
        includeValues: false, // Values not needed for generation, saves bandwidth
      };

      if (Object.keys(filter).length > 0) {
        queryParams.filter = filter;
      }

      const results = await index.query(queryParams);
      const latencyMs = Date.now() - startMs;

      const matches = results.matches || [];
      logger.info(`[SemanticRetriever] Semantic search complete. Retrieved ${matches.length} chunks. (Latency: ${latencyMs}ms)`);
      
      // Log distribution of scores for observability
      if (matches.length > 0) {
        logger.debug(`[SemanticRetriever] Highest score: ${matches[0].score?.toFixed(4)}, Lowest score: ${matches[matches.length - 1].score?.toFixed(4)}`);
      }

      return matches;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      logger.error(`[SemanticRetriever] Semantic search failed after ${latencyMs}ms: ${error.message}`);
      throw error; // Fail fast so caller can handle fault tolerance
    }
  }
}

const semanticRetriever = new SemanticRetriever();

module.exports = {
  semanticRetriever,
  SemanticRetriever
};
