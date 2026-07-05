const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { logger } = require("./logger/index.js");
require("dotenv").config();

class QueryEmbedder {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("[QueryEmbedder] GEMINI_API_KEY is not defined in environment.");
    }
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: "gemini-embedding-001",
    });
  }

    async embed(query) {
    const startMs = Date.now();
    try {
      const vector = await this.embeddings.embedQuery(query);
      const latencyMs = Date.now() - startMs;
      
      logger.debug(`[QueryEmbedder] Successfully embedded query: "${query}" (Dimensions: ${vector.length}, Latency: ${latencyMs}ms)`);
      return vector;
    } catch (error) {
      logger.error(`[QueryEmbedder] Failed to embed query: "${query}". Error: ${error.message}`);
      throw error;
    }
  }
}


const queryEmbedder = new QueryEmbedder();

module.exports = {
  queryEmbedder,
  QueryEmbedder
};
