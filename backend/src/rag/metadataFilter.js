const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate } = require("@langchain/core/prompts");
const { SystemMessage } = require("@langchain/core/messages");
const { logger } = require("./logger/index.js");
require("dotenv").config();

/**
 * Metadata Filter Extraction Service
 * 
 * Purpose: Analyzes the user query to dynamically construct Pinecone-compatible 
 *          metadata filters (e.g., $eq, $in) based on detected intents.
 * Architecture: Uses Gemini Flash with JSON mode to guarantee a strictly structured 
 *               filter object that can be passed directly to the Pinecone query method.
 */
class MetadataFilterExtractor {
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      temperature: 0.0, 
      maxRetries: 1, // Fast fail
    });

    const SYSTEM_PROMPT = `You are a strict JSON metadata filter generator for Pinecone.
Your goal is to extract constraints from the user's query and output a valid JSON Pinecone filter object.

Supported metadata fields in our vector database:
- "section" (string): e.g., "Projects", "Experience", "Education", "Skills", "Portfolio"
- "source" (string): e.g., "PDF", "Markdown"

Rules:
1. ONLY apply a filter if you are 100% certain it will match the exact string. If unsure, output {}
2. Our sections might have varied names like "ACADEMIC PROFILE", "EDUCATION", "Current Education". Using an exact $eq filter is dangerous unless requested.
3. For now, prefer outputting an empty JSON object {} to allow semantic search to find the best match across all sections, UNLESS the user explicitly demands "only search in the projects section".
4. OUTPUT ONLY VALID JSON. Do not include markdown formatting or backticks.`;

    this.prompt = ChatPromptTemplate.fromMessages([
      new SystemMessage(SYSTEM_PROMPT),
      HumanMessagePromptTemplate.fromTemplate("{query}")
    ]);
  }

  /**
   * Extracts metadata filters from the query.
   * @param {string} query - The rewritten user query.
   * @returns {Promise<Object>} Pinecone compatible filter object.
   */
  async extractFilter(query) {
    const startMs = Date.now();
    try {
      const response = await this.prompt.pipe(this.llm).invoke({ query });
      let jsonString = response.content.trim();
      
      // Clean potential markdown blocks returned by the LLM
      if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const filterObj = JSON.parse(jsonString);
      
      const latencyMs = Date.now() - startMs;
      if (Object.keys(filterObj).length > 0) {
        logger.info(`[MetadataFilter] Extracted filter in ${latencyMs}ms: ${JSON.stringify(filterObj)}`);
      } else {
        logger.debug(`[MetadataFilter] No filter extracted. (Latency: ${latencyMs}ms)`);
      }
      
      return filterObj;
    } catch (error) {
      logger.warn(`[MetadataFilter] Failed to extract filter (returning empty {}): ${error.message}`);
      return {}; // Graceful degradation
    }
  }
}

const metadataFilterExtractor = new MetadataFilterExtractor();

module.exports = {
  metadataFilterExtractor,
  MetadataFilterExtractor
};
