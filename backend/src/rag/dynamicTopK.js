const { logger } = require("./logger/index.js");

/**
 * Dynamic Top-K Selection Service
 * 
 * Purpose: Determines the optimal number of chunks to retrieve based on the complexity 
 *          and scope of the user's query.
 * Architecture: Uses high-performance heuristics (zero-latency) to classify queries 
 *               as SIMPLE, COMPLEX, or BROAD to avoid unnecessary LLM round-trips.
 */
class DynamicTopK {
  /**
   * Evaluates the query and returns the ideal Top-K value.
   * 
   * SIMPLE (Top 5): "What is Mithelesh's email?" (Short, specific)
   * COMPLEX (Top 8): "How did he implement the caching layer in Jarvis?" (Technical, multi-faceted)
   * BROAD (Top 12): "Tell me about all his projects and tech stack." (Extensive, wide coverage)
   * 
   * @param {string} query - The user's query.
   * @returns {number} The calculated Top-K limit.
   */
  evaluate(query) {
    if (!query || typeof query !== "string") return 5;
    
    const words = query.trim().split(/\s+/);
    const wordCount = words.length;
    
    const lowerQuery = query.toLowerCase();

    // Broad keywords suggest the user wants a large overview
    const broadKeywords = ["all", "everything", "overview", "list", "summarize", "history", "career", "background"];
    const isBroad = broadKeywords.some(kw => lowerQuery.includes(kw));

    // Complex keywords suggest technical depth requiring more context
    const complexKeywords = ["how", "architecture", "design", "implement", "why", "difference", "compare"];
    const isComplex = complexKeywords.some(kw => lowerQuery.includes(kw)) || query.includes("?");

    let k = 10;
    let classification = "SIMPLE";

    if (isBroad || wordCount > 15) {
      k = 20;
      classification = "BROAD";
    } else if (isComplex || wordCount > 7) {
      k = 15;
      classification = "COMPLEX";
    }

    logger.debug(`[DynamicTopK] Query classified as ${classification} (wordCount: ${wordCount}). Selected Top-K: ${k}`);
    return k;
  }
}

const dynamicTopK = new DynamicTopK();

module.exports = {
  dynamicTopK,
  DynamicTopK
};
