#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const { loadIngestionConfig } = require("./config/index.js");
const { IngestionPipeline } = require("./pipelines/ingestionPipeline.js");
const { logger } = require("./logger/index.js");

const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown"];

function collectFilesFromDir(dirPath) {
  const files = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        files.push(path.join(dirPath, entry.name));
      }
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      "\nUsage:\n" +
      "  node src/rag/ingest.js <file.pdf>\n" +
      "  node src/rag/ingest.js --reindex <file.pdf>\n" +
      "  node src/rag/ingest.js --dir ./knowledge-base\n"
    );
    process.exit(1);
  }

  const reindex  = args.includes("--reindex");
  const dirIndex = args.indexOf("--dir");
  let filePaths  = [];

  if (dirIndex !== -1) {
    const dirArg = args[dirIndex + 1];
    if (!dirArg) { logger.error("--dir flag requires a path argument"); process.exit(1); }

    const absDir = path.resolve(dirArg);
    if (!fs.existsSync(absDir)) { logger.error(`Directory not found: ${absDir}`); process.exit(1); }

    filePaths = collectFilesFromDir(absDir);
    logger.info(`Found ${filePaths.length} supported file(s) in: ${absDir}`);
  } else {
    filePaths = args.filter((a) => !a.startsWith("--"));
  }

  if (filePaths.length === 0) {
    logger.error("No files provided or found. Exiting.");
    process.exit(1);
  }

  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) {
      logger.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }

  
  let config;
  try {
    config = loadIngestionConfig();
  } catch (err) {
    logger.error(`Configuration error: ${err.message}`);
    logger.info(
      "Ensure these are set in backend/.env:\n" +
      "  GEMINI_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME"
    );
    process.exit(1);
  }

  const pipeline = new IngestionPipeline(config);
  const result = await pipeline.run(filePaths, { reindex });

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error(`[RAG] Unhandled error: ${err.message}`);
  process.exit(1);
});
