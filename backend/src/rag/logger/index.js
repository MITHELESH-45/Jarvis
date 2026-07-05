const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const WHITE = "\x1b[37m";

function timestamp() {
  return new Date().toISOString();
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return "";
  return " " + JSON.stringify(meta);
}

class ConsoleLogger {
  constructor(prefix = "RAG") {
    this.prefix = prefix;
  }

  info(message, meta) {
    console.log(
      `${DIM}${timestamp()}${RESET} ${CYAN}[${this.prefix}]${RESET} ${GREEN}INFO${RESET}  ${WHITE}${message}${RESET}${DIM}${formatMeta(meta)}${RESET}`
    );
  }

  warn(message, meta) {
    console.warn(
      `${DIM}${timestamp()}${RESET} ${CYAN}[${this.prefix}]${RESET} ${YELLOW}WARN${RESET}  ${WHITE}${message}${RESET}${DIM}${formatMeta(meta)}${RESET}`
    );
  }

  error(message, meta) {
    console.error(
      `${DIM}${timestamp()}${RESET} ${CYAN}[${this.prefix}]${RESET} ${RED}ERROR${RESET} ${WHITE}${message}${RESET}${DIM}${formatMeta(meta)}${RESET}`
    );
  }

  debug(message, meta) {
    if (process.env.RAG_DEBUG === "true") {
      console.log(
        `${DIM}${timestamp()}${RESET} ${CYAN}[${this.prefix}]${RESET} ${MAGENTA}DEBUG${RESET} ${DIM}${message}${formatMeta(meta)}${RESET}`
      );
    }
  }

  separator() {
    console.log(`\n${BOLD}${DIM}${"─".repeat(56)}${RESET}\n`);
  }

  summary(result) {
    const status = result.success
      ? `${GREEN}${BOLD}SUCCESS${RESET}`
      : `${RED}${BOLD}FAILED${RESET}`;

    this.separator();
    console.log(`${BOLD}${CYAN}  ✦  INGESTION PIPELINE COMPLETE  ✦${RESET}\n`);
    console.log(`  ${BOLD}Status          :${RESET}  ${status}`);
    console.log(`  ${BOLD}Documents       :${RESET}  ${result.documentsLoaded}`);
    console.log(`  ${BOLD}Pages           :${RESET}  ${result.pagesProcessed}`);
    console.log(`  ${BOLD}Sections        :${RESET}  ${result.sectionsDetected}`);
    console.log(`  ${BOLD}Chunks          :${RESET}  ${result.chunksCreated}`);
    console.log(`  ${BOLD}Embeddings      :${RESET}  ${result.embeddingsGenerated}`);
    console.log(`  ${BOLD}Pinecone Upload :${RESET}  ${result.vectorsUploaded} vectors`);
    console.log(`  ${BOLD}Duration        :${RESET}  ${result.durationSeconds.toFixed(1)} seconds`);

    if (result.errors.length > 0) {
      console.log(`\n  ${BOLD}${RED}Errors (${result.errors.length}):${RESET}`);
      result.errors.forEach((e, i) => console.log(`  ${RED}  ${i + 1}. ${e}${RESET}`));
    }
    this.separator();
  }
}

const logger = new ConsoleLogger("RAG");

module.exports = { ConsoleLogger, logger };
