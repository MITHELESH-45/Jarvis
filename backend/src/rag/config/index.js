require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`[RAG Config] Missing required environment variable: ${key}`);
  return value;
}

function optionalEnvInt(key, defaultValue) {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`[RAG Config] ${key} must be an integer, got: "${raw}"`);
  return parsed;
}

function loadIngestionConfig() {
  return {
    geminiApiKey: requireEnv("GEMINI_API_KEY"),
    pineconeApiKey: requireEnv("PINECONE_API_KEY"),
    pineconeIndexName: requireEnv("PINECONE_INDEX_NAME"),
    chunkSize: optionalEnvInt("RAG_CHUNK_SIZE", 1200),
    chunkOverlap: optionalEnvInt("RAG_CHUNK_OVERLAP", 200),
    embeddingBatchSize: optionalEnvInt("RAG_EMBEDDING_BATCH_SIZE", 5),
    interBatchDelayMs: optionalEnvInt("RAG_INTER_BATCH_DELAY_MS", 13000),
    upsertBatchSize: optionalEnvInt("RAG_UPSERT_BATCH_SIZE", 100),
    maxRetries: optionalEnvInt("RAG_MAX_RETRIES", 3),
    retryDelayMs: optionalEnvInt("RAG_RETRY_DELAY_MS", 2000),
  };
}

module.exports = { loadIngestionConfig };
