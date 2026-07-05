const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { queryEmbedder } = require("./embedQuery");
const { hybridRetriever } = require("./hybridRetriever");
const { logger } = require("./logger/index.js");
require("dotenv").config();

class MultiQueryRetriever {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: 0.2, 
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

    async _generateVariations(query) {
    try {
      const response = await this.chain.invoke({ query });
      const variations = response
        .split('\n')
        .map(q => q.trim())
        .filter(q => q.length > 0);
      
      
      const allQueries = Array.from(new Set([query, ...variations]));
      logger.debug(`[MultiQuery] Generated ${allQueries.length} query variations.`);
      return allQueries;
    } catch (error) {
      logger.warn(`[MultiQuery] Failed to generate variations: ${error.message}. Proceeding with original query only.`);
      return [query];
    }
  }

    async retrieve(baseQuery, topK = 5, filter = {}) {
    const startMs = Date.now();
    logger.info(`[MultiQuery] Starting Multi-Query Retrieval for: "${baseQuery}"`);

    
    const queries = await this._generateVariations(baseQuery);
    
    
    const embeddings = await Promise.all(queries.map(q => queryEmbedder.embed(q).catch(() => null)));
    
    
    const retrievalPromises = [];
    for (let i = 0; i < queries.length; i++) {
      if (embeddings[i]) {
        
        retrievalPromises.push(hybridRetriever.retrieve(queries[i], embeddings[i], topK + 3, filter));
      }
    }
    
    const resultsArrays = await Promise.all(retrievalPromises);
    
    
    const finalResults = this._fuseResults(resultsArrays, topK);
    
    const latencyMs = Date.now() - startMs;
    logger.info(`[MultiQuery] Multi-Query Retrieval complete. Found ${finalResults.length} chunks. (Total Latency: ${latencyMs}ms)`);
    
    return finalResults;
  }

    _fuseResults(resultsArrays, topK) {
    const fusionMap = new Map();

    resultsArrays.forEach((resultsList) => {
      resultsList.forEach((item, index) => {
        
        const rank = index + 1;
        const rrfScore = 1.0 / (60 + rank);

        if (fusionMap.has(item.id)) {
          const existing = fusionMap.get(item.id);
          existing.multiQueryScore += rrfScore; 
        } else {
          fusionMap.set(item.id, {
            ...item, 
            multiQueryScore: rrfScore 
          });
        }
      });
    });

    
    const mergedList = Array.from(fusionMap.values()).sort((a, b) => b.multiQueryScore - a.multiQueryScore);
    return mergedList.slice(0, topK);
  }
}

const multiQueryRetriever = new MultiQueryRetriever();

module.exports = {
  multiQueryRetriever,
  MultiQueryRetriever
};
