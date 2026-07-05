const { logger } = require("./logger/index.js");

/**
 * Keyword Retriever Service (Sparse Retrieval)
 * 
 * Purpose: Performs exact-match or sparse lexical retrieval (e.g., BM25).
 * Architecture: Built as an independent retrieval component. The interface guarantees 
 *               compatibility with the HybridRetriever.
 * 
 * Note: Since the current Pinecone index only holds dense vectors, this is currently an interface 
 * placeholder designed to be hot-swapped with a real BM25 microservice, Elasticsearch, or a 
 * Pinecone sparse vector update in the future—without touching the overarching RAG pipeline.
 */
class KeywordRetriever {
  constructor() {
    this.isReady = false; 
    // In a production hybrid setup, initialize BM25 memory cache, Elastic client, or Sparse Embedder here.
  }

  /**
   * Execute sparse keyword retrieval.
   * @param {string} query - The raw text query.
   * @param {number} topK - How many results to return.
   * @param {Object} [filter={}] - Metadata filters.
   * @returns {Promise<Array>} Array of matches formatted exactly like Pinecone results.
   */
  async retrieve(query, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[KeywordRetriever] Executing sparse search for query: "${query}" (topK=${topK})`);

    try {
      // Future Implementation:
      // const sparseVector = await generateSpladeVector(query);
      // const results = await pinecone.query({ sparseVector, topK });
      
      // For now, return an empty array to allow the HybridRetriever to function using 
      // just dense vectors until sparse infrastructure is deployed.
      const matches = [];
      
      const latencyMs = Date.now() - startMs;
      logger.info(`[KeywordRetriever] Sparse search complete. Retrieved ${matches.length} chunks. (Latency: ${latencyMs}ms)`);
      
      return matches;
    } catch (error) {
      logger.error(`[KeywordRetriever] Sparse search failed: ${error.message}`);
      // Graceful degradation: return empty array rather than failing the entire Hybrid Search
      return [];
    }
  }
}

const keywordRetriever = new KeywordRetriever();

module.exports = {
  keywordRetriever,
  KeywordRetriever
};
