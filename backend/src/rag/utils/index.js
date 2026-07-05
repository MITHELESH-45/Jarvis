const crypto = require("crypto");

function generateDeterministicId(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function generateChunkId(documentId, chunkIndex, content) {
  const base = `${documentId}::${chunkIndex}::${content.slice(0, 100)}`;
  return generateDeterministicId(base);
}

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(operation, maxRetries, baseDelayMs, operationName, onRetry) {
  let lastError = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt > maxRetries) break;

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      if (onRetry) await onRetry(attempt, lastError);
      await sleep(delayMs);
    }
  }

  throw new Error(
    `[withRetry] "${operationName}" failed after ${maxRetries + 1} attempts. Last error: ${lastError.message}`
  );
}

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9\-_]/g, "_");
}

function deriveDocumentName(filePath) {
  const base = filePath.split(/[\\/]/).pop() || filePath;
  return base.replace(/\.[^.]+$/, "");
}

function elapsedSeconds(startMs) {
  return (Date.now() - startMs) / 1000;
}

module.exports = {
  generateDeterministicId,
  generateChunkId,
  estimateTokens,
  sleep,
  withRetry,
  chunkArray,
  sanitizeId,
  deriveDocumentName,
  elapsedSeconds,
};
