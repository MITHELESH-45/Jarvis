const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { SystemMessage } = require("@langchain/core/messages");
const { logger } = require("./logger/index.js");
require("dotenv").config();

class Reranker {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: 0.0, 
      maxRetries: 2,
    });

    const SYSTEM_PROMPT = `You are an expert relevance scorer for a Retrieval-Augmented Generation system.
Your task is to evaluate a set of retrieved document chunks against a user's query.

For each chunk, assign a relevance score from 0.0 (completely irrelevant) to 1.0 (perfectly answers the query).

Output ONLY a valid JSON array of objects, exactly matching the length and order of the input chunks. 
Format: [{"score": 0.95}, {"score": 0.12}, ...]
DO NOT output markdown, backticks, or text explanations. Just the JSON array.`;

    this.prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate("Query: {query}\n\nChunks:\n{chunks}")
    ]);
  }

    async rerank(query, chunks, finalTopK = 5, threshold = 0.4) {
    if (!chunks || chunks.length === 0) return [];
    
    const startMs = Date.now();
    logger.debug(`[Reranker] Starting LLM re-ranking for ${chunks.length} chunks.`);

    
    const chunksPayload = chunks.map((c, index) => {
      return `--- CHUNK ${index} ---\nSection: ${c.metadata?.section || 'N/A'}\nContent: ${c.metadata?.text?.substring(0, 500)}...`;
    }).join("\n\n");

    try {
      
      const response = await this.prompt.pipe(this.llm).invoke({ 
        query, 
        chunks: chunksPayload 
      });

      let jsonString = response.content.trim();
      if (jsonString.startsWith("```json")) jsonString = jsonString.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      else if (jsonString.startsWith("```")) jsonString = jsonString.replace(/^```\n?/, "").replace(/\n?```$/, "");

      const scores = JSON.parse(jsonString);

      if (!Array.isArray(scores) || scores.length !== chunks.length) {
        throw new Error("LLM returned malformed or mismatched score array.");
      }

      
      const scoredChunks = chunks.map((chunk, i) => ({
        ...chunk,
        llmScore: scores[i]?.score || 0
      }));

      
      const validChunks = scoredChunks
        .filter(c => c.llmScore >= threshold)
        .sort((a, b) => b.llmScore - a.llmScore);

      
      
      const diverseChunks = this._applyDiversityFilter(validChunks);

      
      const finalChunks = diverseChunks.slice(0, finalTopK);

      const latencyMs = Date.now() - startMs;
      logger.info(`[Reranker] Complete. Retained ${finalChunks.length}/${chunks.length} chunks (Threshold: ${threshold}). (Latency: ${latencyMs}ms)`);

      return finalChunks;
    } catch (error) {
      logger.error(`[Reranker] Re-ranking failed: ${error.message}. Falling back to original RRF ranking.`);
      
      return chunks.slice(0, finalTopK);
    }
  }

    _applyDiversityFilter(chunks) {
    const uniqueIds = new Set();
    const diverse = [];

    for (const chunk of chunks) {
      
      if (!uniqueIds.has(chunk.id)) {
        uniqueIds.add(chunk.id);
        diverse.push(chunk);
      }
    }

    return diverse;
  }
}

const reranker = new Reranker();

module.exports = {
  reranker,
  Reranker
};
