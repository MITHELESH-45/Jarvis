const { ChatOpenAI } = require("@langchain/openai");
const { RouterOutputSchema } = require("./routerSchema");
const { routerPromptTemplate } = require("./routerPrompt");
const { logger } = require("../rag/logger/index.js");

class RouterAgent {
    constructor(config = {}) {
    if (!config.openAIApiKey && !process.env.OPENAI_API_KEY) {
      throw new Error("RouterAgent requires an OpenAI API key.");
    }

    this.modelName = config.modelName || process.env.OPENAI_ROUTER_MODEL || "gpt-4o";
    
    
    const llm = new ChatOpenAI({
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY,
      modelName: this.modelName,
      temperature: config.temperature !== undefined ? config.temperature : 0,
      maxRetries: 3,
    });

    
    this.routerChain = routerPromptTemplate.pipe(
      llm.withStructuredOutput(RouterOutputSchema, { name: "route_decision" })
    );

    logger.info(`[RouterAgent] Initialized with model: ${this.modelName}`);
  }

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

      
      const result = await this.routerChain.invoke({ query });
      const latencyMs = Date.now() - startTime;

      logger.info(`[RouterAgent] Routed to [${result.route}] with confidence ${result.confidence.toFixed(2)} (Latency: ${latencyMs}ms)`);
      logger.debug(`[RouterAgent] Routing reason: ${result.reason}`);

      return result;

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      logger.error(`[RouterAgent] Routing failed after ${latencyMs}ms: ${error.message}`, { stack: error.stack });
      
      
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
