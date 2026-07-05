const { semanticRetriever } = require("./semanticRetriever");
const { keywordRetriever } = require("./keywordRetriever");
const { logger } = require("./logger/index.js");

class HybridRetriever {
    constructor(rrfConstant = 60) {
    this.rrfConstant = rrfConstant;
  }

    async retrieve(queryText, queryVector, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.debug(`[HybridRetriever] Executing hybrid search for: "${queryText}"`);

    try {
      
      const [semanticResults, keywordResults] = await Promise.all([
        semanticRetriever.retrieve(queryVector, topK * 2, filter), 
        keywordRetriever.retrieve(queryText, topK * 2, filter)
      ]);

      
      const fusedResults = this._applyRRF(semanticResults, keywordResults);

      
      const finalResults = fusedResults.slice(0, topK);

      const latencyMs = Date.now() - startMs;
      logger.info(`[HybridRetriever] Hybrid search complete. Yielded ${finalResults.length} fused chunks. (Latency: ${latencyMs}ms)`);
      
      return finalResults;
    } catch (error) {
      logger.error(`[HybridRetriever] Hybrid search failed: ${error.message}`);
      throw error;
    }
  }

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

    
    const mergedList = Array.from(rrfMap.values()).sort((a, b) => b.rrfScore - a.rrfScore);
    
    return mergedList.map(item => ({
      id: item.id,
      score: item.rawScore, 
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
