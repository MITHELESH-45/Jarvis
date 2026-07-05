const { ChatOpenAI } = require("@langchain/openai");
const { RouterOutputSchema } = require("./routerSchema");
const { routerPromptTemplate } = require("./routerPrompt");
const { logger } = require("../rag/logger/index.js");

/**
 * Router Agent
 * 
 * Purpose: Acts as the primary ingress classifier for user queries.
 * Architecture: Utilizes OpenAI GPT-5.5 (or latest available) with Structured Outputs (Function Calling/JSON schema) 
 *               to guarantee programmatic routing decisions without generating conversational text.
 * Flow: User Query -> Prompt Builder -> ChatOpenAI -> Structured JSON Output
 */
class RouterAgent {
  /**
   * Initialize the Router Agent.
   * @param {Object} config - Configuration object.
   * @param {string} config.openAIApiKey - OpenAI API Key.
   * @param {string} [config.modelName="gpt-4o"] - The OpenAI model to use. (Assume gpt-4o or gpt-4-turbo as alias for GPT-5.5 capability)
   * @param {number} [config.temperature=0] - Strictness of the model (0 is highly deterministic).
   */
  constructor(config = {}) {
    if (!config.openAIApiKey && !process.env.OPENAI_API_KEY) {
      throw new Error("RouterAgent requires an OpenAI API key.");
    }

    this.modelName = config.modelName || process.env.OPENAI_ROUTER_MODEL || "gpt-4o";
    
    // Initialize ChatOpenAI
    const llm = new ChatOpenAI({
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY,
      modelName: this.modelName,
      temperature: config.temperature !== undefined ? config.temperature : 0,
      maxRetries: 3,
    });

    // Enforce strict structured output using the Zod schema
    this.routerChain = routerPromptTemplate.pipe(
      llm.withStructuredOutput(RouterOutputSchema, { name: "route_decision" })
    );

    logger.info(`[RouterAgent] Initialized with model: ${this.modelName}`);
  }

  /**
   * Classify the incoming user query.
   * @param {string} query - The user's input string.
   * @returns {Promise<{route: string, confidence: number, reason: string}>} The routing decision.
   */
  async route(query) {
    const startTime = Date.now();
    logger.debug(`[RouterAgent] Received query for routing: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
    
    try {
      if (!query || query.trim() === "") {
        logger.warn("[RouterAgent] Empty query received, defaulting to SMALL_TALK.");
        return {
          route: "SMALL_TALK",
          confidence: 1.0,
          reason: "Empty query provided."
        };
      }

      // Execute the chain
      const result = await this.routerChain.invoke({ query });
      const latencyMs = Date.now() - startTime;

      logger.info(`[RouterAgent] Routed to [${result.route}] with confidence ${result.confidence.toFixed(2)} (Latency: ${latencyMs}ms)`);
      logger.debug(`[RouterAgent] Routing reason: ${result.reason}`);

      return result;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[RouterAgent] Routing failed after ${latencyMs}ms: ${error.message}`, { stack: error.stack });
      
      // Graceful degradation: Fallback to RAG if routing fails, as it's the safest non-destructive operation.
      logger.warn("[RouterAgent] Gracefully degrading to RAG route due to failure.");
      return {
        route: "RAG",
        confidence: 0.0,
        reason: `Fallback route due to error: ${error.message}`
      };
    }
  }
}

module.exports = {
  RouterAgent
};
