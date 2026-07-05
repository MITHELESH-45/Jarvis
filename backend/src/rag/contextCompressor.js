const { logger } = require("./logger/index.js");

class ContextCompressor {
  constructor(maxTokens = 8000) {
    this.maxTokens = maxTokens;
    this.charsPerToken = 4; 
  }

    compress(contextBlocks) {
    if (!contextBlocks || contextBlocks.length === 0) return [];
    
    let currentTokens = 0;
    const compressedBlocks = [];

    logger.debug(`[ContextCompressor] Evaluating ${contextBlocks.length} blocks against ${this.maxTokens} token budget.`);

    
    for (const block of contextBlocks) {
      const blockLengthChars = block.mergedText.length;
      const blockTokens = Math.ceil(blockLengthChars / this.charsPerToken);

      if (currentTokens + blockTokens <= this.maxTokens) {
        
        compressedBlocks.push(block);
        currentTokens += blockTokens;
      } else {
        
        const remainingTokens = this.maxTokens - currentTokens;
        if (remainingTokens > 50) { 
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
        break; 
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
