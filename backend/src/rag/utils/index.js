const crypto = require("crypto");

/**
 * Generates a deterministic SHA-256 based ID from input string.
 */
function generateDeterministicId(input) {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * Generates a unique chunk ID from documentId + chunkIndex + content snippet.
 */
function generateChunkId(documentId, chunkIndex, content) {
  const base = `${documentId}::${chunkIndex}::${content.slice(0, 100)}`;
  return generateDeterministicId(base);
}

/**
 * Estimates token count using 4-chars-per-token heuristic.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff.
 * @param {() => Promise<any>} operation
 * @param {number} maxRetries
 * @param {number} baseDelayMs
 * @param {string} operationName
 * @param {(attempt: number, error: Error) => void | Promise<void>} [onRetry]
 */
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

/**
 * Splits an array into sub-arrays of a given size.
 * @param {any[]} array
 * @param {number} size
 */
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * Sanitizes a string for use as a Pinecone vector ID.
 */
function sanitizeId(id) {
  return id.replace(/[^a-zA-Z0-9\-_]/g, "_");
}

/**
 * Derives a short document name from a file path.
 */
function deriveDocumentName(filePath) {
  const base = filePath.split(/[\\/]/).pop() || filePath;
  return base.replace(/\.[^.]+$/, "");
}

/**
 * Returns elapsed seconds since a given start timestamp (ms).
 */
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
