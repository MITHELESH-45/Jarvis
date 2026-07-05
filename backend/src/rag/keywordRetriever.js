const { logger } = require("./logger/index.js");

class KeywordRetriever {
  constructor() {
    this.isReady = false; 
    
  }

    async retrieve(query, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[KeywordRetriever] Executing sparse search for query: "${query}" (topK=${topK})`);

    try {
      
      
      
      
      
      
      const matches = [];
      
      const latencyMs = Date.now() - startMs;
      logger.info(`[KeywordRetriever] Sparse search complete. Retrieved ${matches.length} chunks. (Latency: ${latencyMs}ms)`);
      
      return matches;
    } catch (error) {
      logger.error(`[KeywordRetriever] Sparse search failed: ${error.message}`);
      
      return [];
    }
  }
}

const keywordRetriever = new KeywordRetriever();

module.exports = {
  keywordRetriever,
  KeywordRetriever
};
