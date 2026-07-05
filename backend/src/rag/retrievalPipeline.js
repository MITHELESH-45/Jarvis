const { queryRewriter } = require("./queryRewriter");
const { dynamicTopK } = require("./dynamicTopK");
const { metadataFilterExtractor } = require("./metadataFilter");
const { multiQueryRetriever } = require("./multiQueryRetriever");
const { reranker } = require("./reranker");
const { contextExpander } = require("./contextExpander");
const { contextCompressor } = require("./contextCompressor");
const { promptBuilder } = require("./promptBuilder");
const { geminiGenerator } = require("./geminiGenerator");
const { logger } = require("./logger/index.js");

/**
 * Advanced Retrieval-Augmented Generation (RAG) Pipeline
 * 
 * Purpose: Orchestrates the entire retrieval and generation lifecycle for the Jarvis Digital Twin.
 * Architecture: 
 *   1. Query Rewriting (Gemini Flash)
 *   2. Dynamic Top-K Selection (Heuristics)
 *   3. Metadata Filter Extraction (Gemini Flash)
 *   4. Multi-Query Hybrid Retrieval (Gemini Embeddings + Pinecone Dense + Sparse RRF)
 *   5. LLM Re-ranking (Gemini Flash)
 *   6. Context Expansion (Parent Document Merging)
 *   7. Context Compression (Token Budgeting)
 *   8. Prompt Building (Anti-Hallucination)
 *   9. Final Generation (Gemini Flash)
 */
class RetrievalPipeline {
  
  /**
   * Executes the full RAG pipeline.
   * @param {string} rawQuery - The original user query.
   * @returns {Promise<Object>} The final response object with answer, confidence, and sources.
   */
  async execute(rawQuery) {
    const pipelineStartMs = Date.now();
    logger.separator();
    logger.info(`[RAG Pipeline] Starting execution for query: "${rawQuery}"`);

    try {
      // 1. Rewrite Query
      const optimizedQuery = await queryRewriter.rewrite(rawQuery);

      // 2. Determine Top-K
      const topK = dynamicTopK.evaluate(optimizedQuery);

      // 3. Extract Metadata Filters
      const filter = await metadataFilterExtractor.extractFilter(optimizedQuery);

      // 4. Multi-Query Hybrid Retrieval
      const initialChunks = await multiQueryRetriever.retrieve(optimizedQuery, topK * 3, filter); // Over-fetch for re-ranking

      if (!initialChunks || initialChunks.length === 0) {
        logger.warn(`[RAG Pipeline] Retrieval yielded 0 results. Skipping to fallback generation.`);
        return this._generateEmptyResponse();
      }

      // 5. LLM Re-ranking & Thresholding
      // We pass the RAW query here because we want the LLM to score based on the user's actual intent.
      // Threshold lowered to 0.3 to ensure we don't accidentally drop chunks with important links (GitHub/LinkedIn).
      const rerankedChunks = await reranker.rerank(rawQuery, initialChunks, topK, 0.3);

      if (!rerankedChunks || rerankedChunks.length === 0) {
        logger.warn(`[RAG Pipeline] All chunks dropped during re-ranking (Threshold not met).`);
        return this._generateEmptyResponse();
      }

      // 6. Context Expansion (Group by Section)
      const contextBlocks = contextExpander.expand(rerankedChunks);

      // 7. Context Compression (Enforce Token Budgets)
      const compressedBlocks = contextCompressor.compress(contextBlocks);

      // 8. Prompt Construction
      const { systemPrompt, humanPrompt } = promptBuilder.build(rawQuery, compressedBlocks);

      // 9. Final Answer Generation
      const finalResponse = await geminiGenerator.generate(systemPrompt, humanPrompt);

      const totalLatency = Date.now() - pipelineStartMs;
      logger.info(`[RAG Pipeline] Execution complete in ${totalLatency}ms. Confidence: ${finalResponse.confidence}`);
      logger.separator();

      return finalResponse;

    } catch (error) {
      const totalLatency = Date.now() - pipelineStartMs;
      logger.error(`[RAG Pipeline] Fatal error during execution after ${totalLatency}ms: ${error.message}`, { stack: error.stack });
      logger.separator();
      
      return {
        answer: "I encountered a critical error while trying to process your request through my knowledge base. Please try again.",
        confidence: 0.0,
        sources: []
      };
    }
  }

  /**
   * Helper to return a fast response when no context is found.
   */
  _generateEmptyResponse() {
    return {
      answer: "I don't have any information regarding that in my current knowledge base.",
      confidence: 1.0, // We are 100% confident we don't know
      sources: []
    };
  }
}

const retrievalPipeline = new RetrievalPipeline();

module.exports = {
  retrievalPipeline,
  RetrievalPipeline
};
