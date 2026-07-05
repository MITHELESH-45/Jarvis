const { semanticRetriever } = require("./semanticRetriever");
const { keywordRetriever } = require("./keywordRetriever");
const { logger } = require("./logger/index.js");

/**
 * Hybrid Retriever Service
 * 
 * Purpose: Combines Semantic (Dense) and Keyword (Sparse) retrieval using Reciprocal Rank Fusion (RRF).
 * Architecture: Fires multiple independent retrievers concurrently to minimize latency. 
 *               Merges result sets algorithmically to balance semantic meaning with exact terminology.
 */
class HybridRetriever {
  /**
   * Initialize Hybrid Retriever.
   * @param {number} rrfConstant - The k-constant used in RRF scoring (standard is 60).
   */
  constructor(rrfConstant = 60) {
    this.rrfConstant = rrfConstant;
  }

  /**
   * Execute hybrid retrieval.
   * @param {string} queryText - The raw query string (for keyword retriever).
   * @param {number[]} queryVector - The embedded query vector (for semantic retriever).
   * @param {number} topK - Number of combined results to return.
   * @param {Object} [filter={}] - Metadata filters.
   * @returns {Promise<Array>} Fused array of chunks sorted by RRF score.
   */
  async retrieve(queryText, queryVector, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[HybridRetriever] Executing hybrid search for: "${queryText}"`);

    try {
      // 1. Run dense and sparse retrievers concurrently
      const [semanticResults, keywordResults] = await Promise.all([
        semanticRetriever.retrieve(queryVector, topK * 2, filter), // Over-fetch for better fusion
        keywordRetriever.retrieve(queryText, topK * 2, filter)
      ]);

      // 2. Apply Reciprocal Rank Fusion (RRF)
      const fusedResults = this._applyRRF(semanticResults, keywordResults);

      // 3. Trim to final Top-K
      const finalResults = fusedResults.slice(0, topK);

      const latencyMs = Date.now() - startMs;
      logger.info(`[HybridRetriever] Hybrid search complete. Yielded ${finalResults.length} fused chunks. (Latency: ${latencyMs}ms)`);
      
      return finalResults;
    } catch (error) {
      logger.error(`[HybridRetriever] Hybrid search failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Implements Reciprocal Rank Fusion.
   * Score = 1 / (k + rank)
   * 
   * @param {Array} denseResults - Results from SemanticRetriever.
   * @param {Array} sparseResults - Results from KeywordRetriever.
   * @returns {Array} Deduplicated, sorted array of merged chunks.
   */
  _applyRRF(denseResults, sparseResults) {
    const rrfMap = new Map();

    const addToMap = (results, listType) => {
      results.forEach((item, index) => {
        const rank = index + 1;
        const rrfScore = 1.0 / (this.rrfConstant + rank);
        
        if (rrfMap.has(item.id)) {
          const existing = rrfMap.get(item.id);
          existing.rrfScore += rrfScore;
          existing.sources.push(listType);
          // Preserve the highest raw dense score if available for reference
          if (listType === "dense") existing.rawScore = item.score; 
        } else {
          rrfMap.set(item.id, {
            id: item.id,
            metadata: item.metadata,
            rrfScore: rrfScore,
            rawScore: listType === "dense" ? item.score : 0,
            sources: [listType]
          });
        }
      });
    };

    addToMap(denseResults, "dense");
    addToMap(sparseResults, "sparse");

    // Sort descending by RRF score
    const mergedList = Array.from(rrfMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    
    return mergedList.map(item => ({
      id: item.id,
      score: item.rawScore, // pass raw cosine score for later thresholding
      rrfScore: item.rrfScore,
      metadata: item.metadata,
      retrievalSources: item.sources
    }));
  }
}

const hybridRetriever = new HybridRetriever();

module.exports = {
  hybridRetriever,
  HybridRetriever
};
