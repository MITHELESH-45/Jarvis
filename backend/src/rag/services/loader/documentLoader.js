const fs = require("fs");
const path = require("path");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { generateDeterministicId, deriveDocumentName } = require("../../utils/index.js");
const { logger } = require("../../logger/index.js");

/**
 * PDF Document Loader.
 * Wraps LangChain's PDFLoader and maps each page into a RawDocument
 * with full source metadata preserved.
 */
class PdfDocumentLoader {
  supports(filePath) {
    return path.extname(filePath).toLowerCase() === ".pdf";
  }

  async load(filePath) {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`[PdfDocumentLoader] File not found: ${absolutePath}`);
    }

    logger.info(`Loading PDF: ${absolutePath}`);

    const langchainLoader = new PDFLoader(absolutePath, { splitPages: true });
    const langchainDocs = await langchainLoader.load();

    const documentId = generateDeterministicId(absolutePath);
    const filename = path.basename(absolutePath);
    const documentName = deriveDocumentName(absolutePath);
    const totalPages = langchainDocs.length;

    logger.info(`Loaded ${totalPages} pages from "${filename}"`, { documentId });

    return langchainDocs.map((doc, index) => ({
      pageContent: doc.pageContent,
      metadata: {
        source: absolutePath,
        filename,
        documentId,
        documentName,
        pageNumber: (doc.metadata?.loc?.pageNumber) ?? index + 1,
        totalPages,
      },
    }));
  }
}

/**
 * Plain-text / Markdown file loader.
 */
class TextDocumentLoader {
  supports(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".txt" || ext === ".md" || ext === ".markdown";
  }

  async load(filePath) {
    const absolutePath = path.resolve(filePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`[TextDocumentLoader] File not found: ${absolutePath}`);
    }

    logger.info(`Loading text file: ${absolutePath}`);

    const content = fs.readFileSync(absolutePath, "utf-8");
    const documentId = generateDeterministicId(absolutePath);
    const filename = path.basename(absolutePath);
    const documentName = deriveDocumentName(absolutePath);

    return [
      {
        pageContent: content,
        metadata: {
          source: absolutePath,
          filename,
          documentId,
          documentName,
          pageNumber: 1,
          totalPages: 1,
        },
      },
    ];
  }
}

/**
 * Router — dispatches to the correct loader based on file extension.
 * Register new loaders with registerLoader() without touching the pipeline.
 */
class DocumentLoaderRouter {
  constructor(loaders) {
    this.loaders = loaders ?? [new PdfDocumentLoader(), new TextDocumentLoader()];
  }

  async load(filePath) {
    const loader = this.loaders.find((l) => l.supports(filePath));
    if (!loader) {
      throw new Error(`[DocumentLoaderRouter] No loader registered for: ${filePath}`);
    }
    return loader.load(filePath);
  }

  registerLoader(loader) {
    this.loaders.unshift(loader);
  }
}

module.exports = { PdfDocumentLoader, TextDocumentLoader, DocumentLoaderRouter };
