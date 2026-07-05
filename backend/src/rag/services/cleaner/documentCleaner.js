class DocumentCleaner {
  clean(doc) {
    let text = doc.pageContent;

    
    text = text.replace(/-\n([a-z])/g, "$1");

    
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    
    text = text.replace(/^\s*Page\s+\d+\s+of\s+\d+\s*$/gim, "");
    text = text.replace(/^\s*\d+\s*$\n/gm, "");

    // Collapse 3+ blank lines to 2
    text = text.replace(/\n{3,}/g, "\n\n");

    
    text = text.split("\n").map((line) => line.trimEnd()).join("\n");

    
    text = text.replace(/([^\s]) {2,}/g, "$1 ");

    
    
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
