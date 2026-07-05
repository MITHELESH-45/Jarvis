const { generateChunkId, sanitizeId } = require("../../utils/index.js");

const TAG_DICTIONARY = {
  ai:         ["artificial intelligence", "ai", "machine learning", "ml", "deep learning", "neural"],
  langchain:  ["langchain"],
  nodejs:     ["node.js", "nodejs", "node js"],
  typescript: ["typescript"],
  javascript: ["javascript"],
  python:     ["python"],
  react:      ["react", "reactjs"],
  nextjs:     ["next.js", "nextjs"],
  rag:        ["rag", "retrieval augmented", "retrieval-augmented"],
  vector_db:  ["pinecone", "chroma", "weaviate", "qdrant", "vector database"],
  llm:        ["llm", "large language model", "gpt", "gemini", "claude", "openai", "anthropic"],
  hackathon:  ["hackathon", "hackfest", "competition", "winner"],
  database:   ["postgresql", "postgres", "mysql", "mongodb", "redis", "prisma"],
  cloud:      ["aws", "gcp", "azure", "google cloud", "vercel", "render"],
  api:        ["rest api", "restful", "graphql", "webhook"],
  docker:     ["docker", "container", "kubernetes"],
  git:        ["git", "github", "gitlab"],
  mcp:        ["mcp", "model context protocol"],
  calendar:   ["google calendar", "scheduling", "appointment"],
  email:      ["gmail", "email", "smtp"],
  auth:       ["oauth", "jwt", "authentication", "google auth"],
  embedding:  ["embedding", "vector embedding", "semantic search"],
  pdf:        ["pdf", "document parsing"],
};

class MetadataEnricher {
  enrich(candidates) {
    return candidates.map((candidate, index) => {
      const chunkId = sanitizeId(generateChunkId(candidate.documentId, index, candidate.content));
      const tags = this._inferTags(candidate.content);

      return {
        chunkId,
        chunkIndex: index,
        content: candidate.content,
        metadata: {
          document_id:      candidate.documentId,
          document_name:    candidate.documentName,
          filename:         candidate.filename,
          page_number:      candidate.pageNumbers[0] ?? 1,
          chunk_id:         chunkId,
          chunk_index:      index,
          section:          candidate.section,
          subsection:       candidate.subsection,
          title:            candidate.title,
          source:           candidate.source,
          created_at:       new Date().toISOString(),
          content_type:     candidate.contentType,
          estimated_tokens: candidate.estimatedTokens,
          tags,
          is_split:         candidate.isSplit,
          split_index:      candidate.splitIndex ?? 0,
          split_total:      candidate.splitTotal ?? 1,
        },
      };
    });
  }

  _inferTags(content) {
    const lower = content.toLowerCase();
    const tags = new Set();
    for (const [tag, keywords] of Object.entries(TAG_DICTIONARY)) {
      if (keywords.some((kw) => lower.includes(kw))) tags.add(tag);
    }
    return Array.from(tags).sort();
  }
}

module.exports = { MetadataEnricher };
