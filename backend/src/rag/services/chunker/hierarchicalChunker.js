const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { estimateTokens } = require("../../utils/index.js");

/**
 * Stage 4 — Hierarchical Chunk Builder.
 *
 * TWO-STAGE strategy:
 *
 * Stage 1 (Primary):  Each logical entity (project, experience, FAQ entry…)
 *                     becomes exactly ONE chunk. Never splits inside a logical unit.
 *
 * Stage 2 (Fallback): If a chunk exceeds `maxChunkSize`, ONLY THEN does
 *                     RecursiveCharacterTextSplitter kick in.
 *
 * This class implements an IChunker-compatible interface.
 * Swap with SemanticChunker or LLMChunker without touching the pipeline.
 */
class HierarchicalChunker {
  constructor({ maxChunkSize, chunkOverlap }) {
    this.maxChunkSize = maxChunkSize;
    this.chunkOverlap = chunkOverlap;
    this.fallbackSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: maxChunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ", ""],
    });
  }

  async chunk(sections) {
    const candidates = [];
    for (const section of sections) {
      await this._processSection(section, section.title, candidates);
    }
    return candidates;
  }

  async _processSection(section, parentTitle, candidates) {
    if (section.subsections.length > 0) {
      // Section preamble (direct content before subsections)
      if (section.content.trim().length > 50) {
        await this._buildCandidate(section.content, section.title, "", section.title, section, candidates);
      }
      // Each subsection = one logical entity
      for (const sub of section.subsections) {
        const entityContent = this._buildSubsectionContent(sub, section.title);
        await this._buildCandidate(entityContent, section.title, sub.title, sub.title, sub, candidates);
      }
    } else {
      if (!section.content.trim()) return;
      await this._buildCandidate(
        section.content,
        parentTitle,
        section.title === parentTitle ? "" : section.title,
        section.title,
        section,
        candidates
      );
    }
  }

  _buildSubsectionContent(sub, parentTitle) {
    const parts = [`[${parentTitle} > ${sub.title}]`];
    if (sub.content.trim()) parts.push(sub.content.trim());

    for (const nested of sub.subsections) {
      if (nested.content.trim()) {
        parts.push(`\n  ${nested.title}\n${nested.content.trim()}`);
      }
    }
    return parts.join("\n\n");
  }

  async _buildCandidate(content, section, subsection, title, sectionObj, candidates) {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (trimmed.length <= this.maxChunkSize) {
      candidates.push(this._makeCandidate(trimmed, section, subsection, title, sectionObj, false));
      return;
    }

    // Fallback splitting
    const splits = await this.fallbackSplitter.splitText(trimmed);
    splits.forEach((splitContent, splitIndex) => {
      candidates.push(
        this._makeCandidate(splitContent, section, subsection, title, sectionObj, true, splitIndex, splits.length)
      );
    });
  }

  _makeCandidate(content, section, subsection, title, sectionObj, isSplit, splitIndex = 0, splitTotal = 1) {
    return {
      content,
      section,
      subsection,
      title,
      sectionType: sectionObj.sectionType,
      contentType: sectionObj.contentType,
      pageNumbers: sectionObj.pageNumbers,
      documentId: sectionObj.documentId,
      documentName: sectionObj.documentName,
      filename: sectionObj.filename,
      source: sectionObj.source,
      estimatedTokens: estimateTokens(content),
      isSplit,
      splitIndex,
      splitTotal,
    };
  }
}

module.exports = { HierarchicalChunker };
