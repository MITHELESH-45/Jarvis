# RAG (Retrieval-Augmented Generation) Pipeline

## Overview
The RAG pipeline provides the AI Digital Twin with context about Mithelesh's portfolio, experiences, and background. It ensures that the AI answers general knowledge questions using factual data from the vector database rather than hallucinating.

## Components

### 1. Ingestion Pipeline
The ingestion process reads raw text/PDF documents and converts them into semantically rich vectors.
- **Document Loader**: Parses files from the data directory.
- **Hierarchical Chunker**: Breaks down large documents into manageable chunks (e.g., sections, paragraphs) to preserve contextual boundaries.
- **Document Cleaner**: Cleans formatting artifacts, normalizes whitespace, and sanitizes text.
- **Metadata Enricher**: Appends necessary metadata (source file, category, timestamp) to each chunk.
- **Embedder**: Uses Google Gemini to generate high-dimensional embeddings for each chunk.
- **Vector Store**: Pushes the embeddings into Pinecone (a cloud vector database) for fast nearest-neighbor retrieval.

### 2. Retrieval Pipeline
When a user asks a question that requires knowledge (routed as `RAG`), the Retrieval Pipeline takes over:
- **Query Rewriter**: Reformulates the user's raw query to be more search-friendly.
- **Hybrid Retriever**: 
  - *Semantic Search*: Finds chunks with similar meaning using cosine similarity.
  - *Keyword Search*: Finds chunks containing exact keyword matches (via BM25 or similar algorithms).
- **Reranker**: Takes the combined results and reranks them based on strict relevance to the prompt.
- **Prompt Builder**: Injects the top results into a highly structured system prompt.
- **Generator**: Uses an LLM (GPT-4o or Gemini) to generate the final response, adopting the persona of Mithelesh's Digital Twin.
