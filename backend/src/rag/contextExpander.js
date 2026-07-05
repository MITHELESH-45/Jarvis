const { logger } = require("./logger/index.js");

class ContextExpander {
  
    expand(chunks) {
    if (!chunks || chunks.length === 0) return [];
    
    logger.debug(`[ContextExpander] Expanding context for ${chunks.length} chunks.`);

    
    const grouped = new Map();

    for (const chunk of chunks) {
      const sectionName = chunk.metadata?.section || "Uncategorized";
      const docId = chunk.metadata?.document_id || "UnknownDoc";
      
      const groupKey = `${docId}::${sectionName}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          section: sectionName,
          documentId: docId,
          chunks: [],
          highestScore: chunk.llmScore || chunk.score || 0
        });
      }

      const group = grouped.get(groupKey);
      group.chunks.push(chunk);
      
      if ((chunk.llmScore || chunk.score || 0) > group.highestScore) {
        group.highestScore = chunk.llmScore || chunk.score || 0;
      }
    }

    
    const expandedContexts = [];

    for (const [key, group] of grouped.entries()) {
      
      
      
      const mergedText = group.chunks
        .map(c => c.metadata?.text || "")
        .join("\n\n... [Context Gap] ...\n\n");

      expandedContexts.push({
        section: group.section,
        documentId: group.documentId,
        mergedText: mergedText,
        chunkCount: group.chunks.length,
        relevanceScore: group.highestScore,
        
        sourceChunkIds: group.chunks.map(c => c.id) 
      });
    }

    
    expandedContexts.sort((a, b) => b.relevanceScore - a.relevanceScore);

    logger.info(`[ContextExpander] Consolidated ${chunks.length} chunks into ${expandedContexts.length} cohesive context blocks.`);
    return expandedContexts;
  }
}

const contextExpander = new ContextExpander();

module.exports = {
  contextExpander,
  ContextExpander
};
