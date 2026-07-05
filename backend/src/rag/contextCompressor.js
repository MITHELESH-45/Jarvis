const { logger } = require("./logger/index.js");

/**
 * Context Compressor Service
 * 
 * Purpose: Ensures that the final payload of Context Blocks does not exceed the token 
 *          limit of the Generation LLM. 
 * Architecture: Uses an approximation formula for token counts. Iteratively drops the lowest 
 *               relevance blocks or truncates text if the budget is exceeded.
 */
class ContextCompressor {
  constructor(maxTokens = 8000) {
    this.maxTokens = maxTokens;
    this.charsPerToken = 4; // Standard approximation (4 characters ~= 1 token)
  }

  /**
   * Compresses the context blocks to fit within the token budget.
   * @param {Array} contextBlocks - The expanded context blocks.
   * @returns {Array} Compressed context blocks.
   */
  compress(contextBlocks) {
    if (!contextBlocks || contextBlocks.length === 0) return [];
    
    let currentTokens = 0;
    const compressedBlocks = [];

    logger.debug(`[ContextCompressor] Evaluating ${contextBlocks.length} blocks against ${this.maxTokens} token budget.`);

    // Blocks are already sorted by relevance (highest first) from ContextExpander
    for (const block of contextBlocks) {
      const blockLengthChars = block.mergedText.length;
      const blockTokens = Math.ceil(blockLengthChars / this.charsPerToken);

      if (currentTokens + blockTokens <= this.maxTokens) {
        // Fits entirely
        compressedBlocks.push(block);
        currentTokens += blockTokens;
      } else {
        // Doesn't fit entirely. Truncate this block to fit the remaining budget.
        const remainingTokens = this.maxTokens - currentTokens;
        if (remainingTokens > 50) { // Only truncate if we have a meaningful amount of tokens left
          const allowedChars = remainingTokens * this.charsPerToken;
          
          logger.warn(`[ContextCompressor] Token budget reached. Truncating block "${block.section}" to ${allowedChars} characters.`);
          
          compressedBlocks.push({
            ...block,
            mergedText: block.mergedText.substring(0, allowedChars) + "\n...[TRUNCATED DUE TO TOKEN LIMITS]..."
          });
          currentTokens += remainingTokens;
        } else {
          logger.warn(`[ContextCompressor] Token budget exhausted. Dropping remaining lower-relevance blocks.`);
        }
        break; // Stop adding blocks once budget is hit
      }
    }

    logger.info(`[ContextCompressor] Compression complete. Retained ${compressedBlocks.length} blocks using approx ${currentTokens} tokens.`);
    return compressedBlocks;
  }
}

const contextCompressor = new ContextCompressor();

module.exports = {
  contextCompressor,
  ContextCompressor
};
