const { logger } = require("./logger/index.js");

class DynamicTopK {
    evaluate(query) {
    if (!query || typeof query !== "string") return 5;
    
    const words = query.trim().split(/\s+/);
    const wordCount = words.length;
    
    const lowerQuery = query.toLowerCase();

    
    const broadKeywords = ["all", "everything", "overview", "list", "summarize", "history", "career", "background"];
    const isBroad = broadKeywords.some(kw => lowerQuery.includes(kw));

    
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
