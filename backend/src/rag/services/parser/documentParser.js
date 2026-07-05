const SECTION_PATTERNS = [
  { type: "projects",        patterns: [/^projects?$/i, /^(personal|side|key)\s+projects?$/i, /^project\s+showcase$/i] },
  { type: "work_experience", patterns: [/^(work\s+)?experience$/i, /^professional\s+experience$/i, /^employment(\s+history)?$/i, /^career(\s+history)?$/i] },
  { type: "education",       patterns: [/^education(al\s+background)?$/i, /^academic\s+(background|history|qualifications?)$/i] },
  { type: "certifications",  patterns: [/^certifications?$/i, /^licenses?\s*(&|and)\s*certifications?$/i, /^credentials?$/i] },
  { type: "skills",          patterns: [/^(technical\s+)?skills?$/i, /^core\s+competencies$/i, /^technologies?$/i, /^tech\s+stack$/i] },
  { type: "achievements",    patterns: [/^achievements?$/i, /^accomplishments?$/i, /^awards?\s*(&|and)\s+honors?$/i] },
  { type: "publications",    patterns: [/^publications?$/i, /^research(\s+papers?)?$/i] },
  { type: "faq",             patterns: [/^faq$/i, /^frequently\s+asked\s+questions?$/i, /^q\s*&\s*a$/i] },
  { type: "recruiter_guide", patterns: [/^recruiter'?s?\s+(guide|kit|handbook)$/i, /^for\s+recruiters?$/i] },
  { type: "availability",    patterns: [/^availability$/i, /^open\s+to\s+work$/i, /^job\s+(search\s+)?status$/i] },
  { type: "contact",         patterns: [/^contact(\s+information)?$/i, /^(get\s+in\s+touch|reach\s+me)$/i] },
  { type: "summary",         patterns: [/^(professional\s+)?summary$/i, /^(executive\s+)?profile$/i, /^about\s+me$/i, /^overview$/i, /^introduction$/i] },
];

function detectSectionType(title) {
  const trimmed = title.trim();
  for (const { type, patterns } of SECTION_PATTERNS) {
    if (patterns.some((p) => p.test(trimmed))) return type;
  }
  return "general";
}

function detectContentType(content) {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const bulletCount   = lines.filter((l) => /^\s*[-•*▪◦]\s/.test(l)).length;
  const numberedCount = lines.filter((l) => /^\s*\d+[\.\)]\s/.test(l)).length;
  const headingCount  = lines.filter((l) => /^#+\s/.test(l)).length;
  const tableCount    = lines.filter((l) => /^\|.+\|/.test(l)).length;
  const codeCount     = lines.filter((l) => /^```|^\s{4,}\S/.test(l)).length;

  if (tableCount    > 2)                   return "table";
  if (codeCount     > 2)                   return "code_block";
  if (headingCount  > lines.length * 0.3) return "heading";
  if (bulletCount   > lines.length * 0.3) return "bullet_list";
  if (numberedCount > lines.length * 0.3) return "numbered_list";
  return "paragraph";
}

class DocumentParser {
  parse(docs) {
    const allSections = [];

    
    const byDocument = new Map();
    for (const doc of docs) {
      const key = doc.metadata.documentId;
      if (!byDocument.has(key)) byDocument.set(key, []);
      byDocument.get(key).push(doc);
    }

    for (const [, pages] of byDocument) {
      const fullText = pages.map((p) => p.pageContent).join("\n\n");
      const meta = pages[0].metadata;
      const sections = this._parseDocument(fullText, pages, meta.documentId, meta.filename, meta.documentName);
      allSections.push(...sections);
    }

    return allSections;
  }

  _parseDocument(fullText, pages, documentId, filename, documentName) {
    const lines = fullText.split("\n");
    const sections = [];
    const source = pages[0]?.metadata.source ?? filename;

    let currentSection = null;
    let currentSubsection = null;
    let buffer = [];

    const flushBuffer = () => {
      if (buffer.length === 0) return;
      const content = buffer.join("\n").trim();
      buffer = [];
      if (!content) return;

      if (currentSubsection) {
        currentSubsection.content = (currentSubsection.content + "\n" + content).trim();
      } else if (currentSection) {
        currentSection.content = (currentSection.content + "\n" + content).trim();
      }
    };

    const makeSection = (title, level, pageNum) => ({
      title,
      level,
      sectionType: detectSectionType(title),
      contentType: "heading",
      content: "",
      subsections: [],
      pageNumbers: [pageNum],
      documentId,
      documentName: documentName || filename.replace(/\.[^.]+$/, ""),
      filename,
      source,
    });

    for (const line of lines) {
      const trimmed = line.trim();

      // Markdown headings: ## Title
      const mdMatch = line.match(/^(#{1,4})\s+(.+)/);
      // Numbered sections: 1. Title
      const numberedMatch = !mdMatch && line.match(/^(\d+[\.\)]\s+)(.+)/);
      // ALL-CAPS heading (common in PDF exports): EXPERIENCE, PROJECTS
      const capsMatch =
        !mdMatch &&
        !numberedMatch &&
        /^[A-Z][A-Z\s&\/\-]{3,}$/.test(trimmed) &&
        trimmed.length < 80 &&
        trimmed.length > 3;

      const currentPage = 1; // simplified; accurate enough for metadata

      if (mdMatch || capsMatch || numberedMatch) {
        flushBuffer();

        let level = 1;
        let title = trimmed;

        if (mdMatch) {
          level = mdMatch[1].length;
          title = mdMatch[2].trim();
        } else if (numberedMatch) {
          level = 2;
          title = numberedMatch[2].trim();
        }

        const newSection = makeSection(title, level, currentPage);

        if (level === 1) {
          currentSection = newSection;
          currentSubsection = null;
          sections.push(newSection);
        } else if (level >= 2 && currentSection) {
          currentSubsection = newSection;
          currentSection.subsections.push(newSection);
        } else {
          // Orphan sub-heading — create an implicit parent
          const orphan = makeSection("general", 1, currentPage);
          orphan.subsections.push(newSection);
          currentSection = orphan;
          currentSubsection = newSection;
          sections.push(orphan);
        }
      } else {
        buffer.push(line);
      }
    }

    flushBuffer();

    
    if (sections.length === 0) {
      sections.push({
        title: documentName || filename.replace(/\.[^.]+$/, ""),
        level: 1,
        sectionType: "general",
        contentType: detectContentType(fullText),
        content: fullText,
        subsections: [],
        pageNumbers: pages.map((p) => p.metadata.pageNumber),
        documentId,
        documentName: documentName || filename.replace(/\.[^.]+$/, ""),
        filename,
        source,
      });
    }

    
    for (const section of sections) {
      if (section.content) section.contentType = detectContentType(section.content);
      for (const sub of section.subsections) {
        if (sub.content) sub.contentType = detectContentType(sub.content);
      }
    }

    return sections;
  }
}

module.exports = { DocumentParser };
