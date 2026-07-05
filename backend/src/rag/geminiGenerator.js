const { ChatOpenAI } = require("@langchain/openai");
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { SystemMessage, HumanMessage } = require("@langchain/core/messages");
const { logger } = require("./logger/index.js");
require("dotenv").config();

/**
 * Gemini Generator Service
 * 
 * Purpose: Executes the final Answer Generation phase using Gemini Flash.
 * Architecture: Enforces structured JSON output. Implements retries and fault tolerance.
 */
class GeminiGenerator {
  constructor() {
    // 1. Initialize Gemini (Primary RAG Engine)
    if (process.env.GEMINI_API_KEY) {
      this.geminiLlm = new ChatGoogleGenerativeAI({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        temperature: 0.4,
        maxRetries: 1, // Keep low to quickly trigger fallback
      });
    }

    // 2. Initialize OpenAI (Fallback Engine)
    if (process.env.OPENAI_API_KEY) {
      this.openAiLlm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: "gpt-4o",
        temperature: 0.4,
        maxRetries: 2,
      });
    }

    if (!this.geminiLlm && !this.openAiLlm) {
      throw new Error("[GeminiGenerator] Neither GEMINI_API_KEY nor OPENAI_API_KEY is defined.");
    }
  }

  /**
   * Generates the final RAG response.
   * @param {string} systemPrompt - The constrained system instructions with context.
   * @param {string} humanPrompt - The user query.
   * @returns {Promise<Object>} The structured JSON response containing answer, confidence, and sources.
   */
  async generate(systemPrompt, humanPrompt) {
    const startMs = Date.now();
    logger.debug(`[GeminiGenerator] Commencing generation phase...`);

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt)
    ];

    try {
      let response;
      let usedEngine = "Gemini";

      try {
        // Attempt Primary: Gemini
        if (!this.geminiLlm) throw new Error("Gemini not configured");
        response = await this.geminiLlm.invoke(messages);
      } catch (geminiError) {
        logger.warn(`[GeminiGenerator] Gemini failed (${geminiError.message}). Attempting OpenAI fallback...`);
        // Fallback: OpenAI
        if (!this.openAiLlm) throw new Error("OpenAI fallback not configured");
        response = await this.openAiLlm.invoke(messages);
        usedEngine = "OpenAI";
      }
      
      let jsonString = response.content.trim();
      
      // Clean markdown formatting if present
      if (jsonString.startsWith("```json")) {
        jsonString = jsonString.replace(/^```json\n?/, "").replace(/\n?```$/, "");
      } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.replace(/^```\n?/, "").replace(/\n?```$/, "");
      }

      const resultObj = JSON.parse(jsonString);
      resultObj._engine = usedEngine;

      const latencyMs = Date.now() - startMs;
      logger.info(`[GeminiGenerator] Generation complete using ${usedEngine}. Confidence: ${resultObj.confidence} (Latency: ${latencyMs}ms)`);
      
      return resultObj;
    } catch (error) {
      const latencyMs = Date.now() - startMs;
      logger.error(`[GeminiGenerator] Generation failed after ${latencyMs}ms: ${error.message}`);
      
      // Fallback response for fault tolerance
      return {
        answer: "I apologize, but I encountered an internal error while trying to generate the response based on my knowledge base. Please try asking again.",
        confidence: 0.0,
        sources: [],
        _engine: "ErrorFallback"
      };
    }
  }
}

const geminiGenerator = new GeminiGenerator();

module.exports = {
  geminiGenerator,
  GeminiGenerator
};
