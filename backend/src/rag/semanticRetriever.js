const { Pinecone } = require("@pinecone-database/pinecone");
const { logger } = require("./logger/index.js");
require("dotenv").config();

class SemanticRetriever {
  constructor() {
    const apiKey = process.env.PINECONE_API_KEY;
    this.indexName = process.env.PINECONE_INDEX_NAME || "jarvis-knowledge-base";
    
    if (!apiKey) {
      throw new Error("[SemanticRetriever] PINECONE_API_KEY is not defined in environment.");
    }
    
    
    this.client = new Pinecone({ apiKey });
  }

    async retrieve(vector, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[SemanticRetriever] Executing semantic search (topK=${topK}, filter=${JSON.stringify(filter)})`);
    
    try {
      const index = this.client.index({ name: this.indexName });
      
      const queryParams = {
        vector,
        topK,
        includeMetadata: true,
        includeValues: false, 
      };

      if (Object.keys(filter).length > 0) {
        queryParams.filter = filter;
      }

      const results = await index.query(queryParams);
      const latencyMs = Date.now() - startMs;

      const matches = results.matches || [];
      logger.info(`[SemanticRetriever] Semantic search complete. Retrieved ${matches.length} chunks. (Latency: ${latencyMs}ms)`);
      
      
      if (matches.length > 0) {
        logger.debug(`[SemanticRetriever] Highest score: ${matches[0].score?.toFixed(4)}, Lowest score: ${matches[matches.length - 1].score?.toFixed(4)}`);
      }

      return matches;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      logger.error(`[SemanticRetriever] Semantic search failed after ${latencyMs}ms: ${error.message}`);
      throw error; 
    }
  }
}

const semanticRetriever = new SemanticRetriever();

module.exports = {
  semanticRetriever,
  SemanticRetriever
};
