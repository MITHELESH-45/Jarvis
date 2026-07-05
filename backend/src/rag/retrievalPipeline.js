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

class RetrievalPipeline {
  
    async execute(rawQuery) {
    const pipelineStartMs = Date.now();
    logger.separator();
    logger.info(`[RAG Pipeline] Starting execution for query: "${rawQuery}"`);

    try {
      
      const optimizedQuery = await queryRewriter.rewrite(rawQuery);

      
      const topK = dynamicTopK.evaluate(optimizedQuery);

      
      const filter = await metadataFilterExtractor.extractFilter(optimizedQuery);

      
      const initialChunks = await multiQueryRetriever.retrieve(optimizedQuery, topK * 3, filter); 

      if (!initialChunks || initialChunks.length === 0) {
        logger.warn(`[RAG Pipeline] Retrieval yielded 0 results. Skipping to fallback generation.`);
        return this._generateEmptyResponse();
      }

      
      
      
      const rerankedChunks = await reranker.rerank(rawQuery, initialChunks, topK, 0.3);

      if (!rerankedChunks || rerankedChunks.length === 0) {
        logger.warn(`[RAG Pipeline] All chunks dropped during re-ranking (Threshold not met).`);
        return this._generateEmptyResponse();
      }

      
      const contextBlocks = contextExpander.expand(rerankedChunks);

      
      const compressedBlocks = contextCompressor.compress(contextBlocks);

      
      const { systemPrompt, humanPrompt } = promptBuilder.build(rawQuery, compressedBlocks);

      
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

    _generateEmptyResponse() {
    return {
      answer: "I don't have any information regarding that in my current knowledge base.",
      confidence: 1.0, 
      sources: []
    };
  }
}

const retrievalPipeline = new RetrievalPipeline();

module.exports = {
  retrievalPipeline,
  RetrievalPipeline
};
