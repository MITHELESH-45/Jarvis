/**
 * Stage 2 — Document Cleaner.
 *
 * Normalizes extracted PDF text while preserving meaningful structure:
 * headings, bullets, numbered lists, indentation, and tables are kept.
 * PDF artifacts (hyphenated line-breaks, page numbers, invisible chars) are removed.
 */
class DocumentCleaner {
  clean(doc) {
    let text = doc.pageContent;

    // Fix PDF hyphenated line-breaks ("develop-\nment" → "development")
    text = text.replace(/-\n([a-z])/g, "$1");

    // Normalize line endings
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Remove standalone page number lines ("Page 1 of 10" or lone digits)
    text = text.replace(/^\s*Page\s+\d+\s+of\s+\d+\s*$/gim, "");
    text = text.replace(/^\s*\d+\s*$\n/gm, "");

    // Collapse 3+ blank lines to 2
    text = text.replace(/\n{3,}/g, "\n\n");

    // Remove trailing whitespace per line (keep leading for indentation)
    text = text.split("\n").map((line) => line.trimEnd()).join("\n");

    // Collapse duplicate inline spaces (but not leading indentation)
    text = text.replace(/([^\s]) {2,}/g, "$1 ");

    // Remove invisible/control characters
    // eslint-disable-next-line no-control-regex
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
    text = text.replace(/\u00AD/g, ""); // soft hyphen

    // Normalize curly quotes to straight quotes
    text = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');

    text = text.trim();

    return { pageContent: text, metadata: doc.metadata };
  }

  cleanBatch(docs) {
    return docs.map((doc) => this.clean(doc));
  }
}

module.exports = { DocumentCleaner };
