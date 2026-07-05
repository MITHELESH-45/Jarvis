const { logger } = require("./logger/index.js");

/**
 * Context Expander Service (Parent Document / Window Retrieval)
 * 
 * Purpose: Ensures that retrieved chunks aren't presented to the LLM in jagged, fragmented ways. 
 *          If multiple chunks from the same logical section are retrieved, they are merged.
 *          If a chunk is isolated, it attempts to fetch its surrounding window (simulated here via grouping).
 * Architecture: Analyzes metadata (section, documentId) and reconstructs the narrative flow.
 */
class ContextExpander {
  
  /**
   * Expands and groups retrieved chunks by their parent document structure.
   * @param {Array} chunks - The finalized, re-ranked list of chunks.
   * @returns {Array} An array of expanded "Context Blocks" representing cohesive parent documents.
   */
  expand(chunks) {
    if (!chunks || chunks.length === 0) return [];
    
    logger.debug(`[ContextExpander] Expanding context for ${chunks.length} chunks.`);

    // 1. Group chunks by their parent Section (or Document ID)
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
      // Keep track of the highest relevance score in this group
      if ((chunk.llmScore || chunk.score || 0) > group.highestScore) {
        group.highestScore = chunk.llmScore || chunk.score || 0;
      }
    }

    // 2. Build cohesive context blocks
    const expandedContexts = [];

    for (const [key, group] of grouped.entries()) {
      // Sort chunks within the group conceptually (if we had explicit chunk indexes, we'd sort by them)
      // Since we don't, we will just concatenate them cleanly.
      
      const mergedText = group.chunks
        .map(c => c.metadata?.text || "")
        .join("\n\n... [Context Gap] ...\n\n");

      expandedContexts.push({
        section: group.section,
        documentId: group.documentId,
        mergedText: mergedText,
        chunkCount: group.chunks.length,
        relevanceScore: group.highestScore,
        // Collect all chunk IDs for citations
        sourceChunkIds: group.chunks.map(c => c.id) 
      });
    }

    // 3. Sort expanded blocks by relevance
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
