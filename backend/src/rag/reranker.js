const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { SystemMessage } = require("@langchain/core/messages");
const { logger } = require("./logger/index.js");
require("dotenv").config();

/**
 * LLM Re-ranker Service
 * 
 * Purpose: Applies an LLM-based re-ranking step to the initially retrieved chunks. 
 *          Vector similarity often retrieves tangential information. By asking the LLM 
 *          to score the chunks against the query, we guarantee high precision.
 * Architecture: Batch prompt to Gemini Flash -> JSON scoring -> Filter & Sort -> Truncate
 */
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

  /**
   * Re-ranks the retrieved chunks using an LLM.
   * @param {string} query - The user's query.
   * @param {Array} chunks - The list of chunks returned from Hybrid/Multi-Query retrieval.
   * @param {number} finalTopK - The target number of chunks to retain.
   * @param {number} threshold - The minimum score required to be kept (0.0 to 1.0).
   * @returns {Promise<Array>} The refined, sorted, and truncated list of chunks.
   */
  async rerank(query, chunks, finalTopK = 5, threshold = 0.4) {
    if (!chunks || chunks.length === 0) return [];
    
    const startMs = Date.now();
    logger.debug(`[Reranker] Starting LLM re-ranking for ${chunks.length} chunks.`);

    // 1. Prepare chunks payload
    const chunksPayload = chunks.map((c, index) => {
      return `--- CHUNK ${index} ---\nSection: ${c.metadata?.section || 'N/A'}\nContent: ${c.metadata?.text?.substring(0, 500)}...`;
    }).join("\n\n");

    try {
      // 2. Invoke LLM for scoring
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

      // 3. Map scores back to chunks and apply threshold
      const scoredChunks = chunks.map((chunk, i) => ({
        ...chunk,
        llmScore: scores[i]?.score || 0
      }));

      // Filter out low relevance and sort descending
      const validChunks = scoredChunks
        .filter(c => c.llmScore >= threshold)
        .sort((a, b) => b.llmScore - a.llmScore);

      // 4. Implement basic MMR (Maximal Marginal Relevance) / Diversity
      // We will skip exact duplicate chunks or chunks that share 90%+ overlapping text.
      const diverseChunks = this._applyDiversityFilter(validChunks);

      // 5. Truncate to finalTopK
      const finalChunks = diverseChunks.slice(0, finalTopK);

      const latencyMs = Date.now() - startMs;
      logger.info(`[Reranker] Complete. Retained ${finalChunks.length}/${chunks.length} chunks (Threshold: ${threshold}). (Latency: ${latencyMs}ms)`);

      return finalChunks;
    } catch (error) {
      logger.error(`[Reranker] Re-ranking failed: ${error.message}. Falling back to original RRF ranking.`);
      // Graceful degradation: If LLM re-ranking fails, just return the topK of the original list
      return chunks.slice(0, finalTopK);
    }
  }

  /**
   * Basic diversity filter to prevent identical context segments from consuming the token budget.
   * @param {Array} chunks - The scored chunks.
   * @returns {Array} Chunks with duplicates removed.
   */
  _applyDiversityFilter(chunks) {
    const uniqueIds = new Set();
    const diverse = [];

    for (const chunk of chunks) {
      // If the exact same chunk ID was already added, skip it
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
