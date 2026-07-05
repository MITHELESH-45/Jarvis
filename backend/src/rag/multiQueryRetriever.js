const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { queryEmbedder } = require("./embedQuery");
const { hybridRetriever } = require("./hybridRetriever");
const { logger } = require("./logger/index.js");
require("dotenv").config();

/**
 * Multi-Query Retriever Service
 * 
 * Purpose: Overcomes the limitation of single-vector distance searches by generating 
 *          multiple distinct perspectives of the original query, searching for all of them, 
 *          and mathematically fusing the results.
 * Architecture: Gemini Flash generates variations -> Concurrent Embedding -> Concurrent Hybrid Search -> RRF Merge
 */
class MultiQueryRetriever {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: 0.2, // Slight temperature to encourage diverse phrasing
      maxRetries: 2,
    });

    const SYSTEM_PROMPT = `You are an AI assistant tasked with generating 3 distinct search queries for a vector database.
Your goal is to maximize retrieval coverage for the user's original query by providing different perspectives, synonyms, or related concepts.
Output EXACTLY 3 distinct queries, one per line. Do NOT include numbers, bullets, or explanations.`;

    this.prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate("Original query: {query}")
    ]);

    this.chain = this.prompt.pipe(this.llm).pipe(new StringOutputParser());
  }

  /**
   * Generates query variations using the LLM.
   * @param {string} query - The rewritten/base query.
   * @returns {Promise<string[]>} Array of queries (original + variations).
   */
  async _generateVariations(query) {
    try {
      const response = await this.chain.invoke({ query });
      const variations = response
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      // Ensure we always have the original query included
      const allQueries = Array.from(new Set([query, ...variations]));
      logger.debug(`[MultiQuery] Generated ${allQueries.length} query variations.`);
      return allQueries;
    } catch (error) {
      logger.warn(`[MultiQuery] Failed to generate variations: ${error.message}. Proceeding with original query only.`);
      return [query];
    }
  }

  /**
   * Executes multi-query expansion, retrieval, and fusion.
   * @param {string} baseQuery - The optimized base query.
   * @param {number} topK - How many final chunks to return.
   * @param {Object} [filter={}] - Metadata filters.
   * @returns {Promise<Array>} Final fused and deduplicated array of retrieved chunks.
   */
  async retrieve(baseQuery, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.info(`[MultiQuery] Starting Multi-Query Retrieval for: "${baseQuery}"`);

    // 1. Generate variations
    const queries = await this._generateVariations(baseQuery);
    
    // 2. Concurrently embed all variations
    const embeddings = await Promise.all(queries.map(q => queryEmbedder.embed(q).catch(() => null)));
    
    // 3. Concurrently execute hybrid retrieval for all successful embeddings
    const retrievalPromises = [];
    for (let i = 0; i < queries.length; i++) {
      if (embeddings[i]) {
        // Fetch slightly more to ensure good fusion overlap
        retrievalPromises.push(hybridRetriever.retrieve(queries[i], embeddings[i], topK + 3, filter));
      }
    }
    
    const resultsArrays = await Promise.all(retrievalPromises);
    
    // 4. Merge all result sets using a simple frequency & score fusion (similar to RRF)
    const finalResults = this._fuseResults(resultsArrays, topK);
    
    const latencyMs = Date.now() - startMs;
    logger.info(`[MultiQuery] Multi-Query Retrieval complete. Found ${finalResults.length} chunks. (Total Latency: ${latencyMs}ms)`);
    
    return finalResults;
  }

  /**
   * Fuses multiple result lists into a single ranked list, eliminating duplicates.
   * @param {Array<Array>} resultsArrays - Array of result arrays.
   * @param {number} topK - Final count to return.
   * @returns {Array} Top-K fused results.
   */
  _fuseResults(resultsArrays, topK) {
    const fusionMap = new Map();

    resultsArrays.forEach((resultsList) => {
      resultsList.forEach((item, index) => {
        // Use RRF-style scoring for merging the multi-query lists
        const rank = index + 1;
        const rrfScore = 1.0 / (60 + rank);

        if (fusionMap.has(item.id)) {
          const existing = fusionMap.get(item.id);
          existing.multiQueryScore += rrfScore; // Aggregate score
        } else {
          fusionMap.set(item.id, {
            ...item, // Preserve the item (includes its internal rrfScore from HybridRetriever)
            multiQueryScore: rrfScore 
          });
        }
      });
    });

    // Sort by aggregated multi-query score descending
    const mergedList = Array.from(fusionMap.values()).sort((a, b) => b.multiQueryScore - a.multiQueryScore);
    return mergedList.slice(0, topK);
  }
}

const multiQueryRetriever = new MultiQueryRetriever();

module.exports = {
  multiQueryRetriever,
  MultiQueryRetriever
};
