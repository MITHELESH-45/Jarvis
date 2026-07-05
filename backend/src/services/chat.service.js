const { RouterAgent } = require("../router/routerAgent");
const { retrievalPipeline } = require("../rag/retrievalPipeline");
const { logger } = require("../rag/logger/index.js");
const { handleChatMessage } = require("../agents/orchestrator");

/**
 * Chat Service
 * 
 * Purpose: The central brain of the API layer. Uses the Router Agent to classify the 
 *          incoming request and dynamically delegates it to either the RAG or Action pipeline.
 */
class ChatService {
  constructor() {
    this.routerAgent = new RouterAgent();
  }

  /**
   * Process a user query from end-to-end.
   * @param {string} query - The raw user input.
   * @returns {Promise<Object>} The final system response.
   */
  async processQuery(query, userId) {
    const startMs = Date.now();
    logger.info(`[ChatService] Received new query: "${query}" (User: ${userId})`);

    try {
      // 1. Route the query using OpenAI structured outputs
      const routingDecision = await this.routerAgent.route(query);

      let response;

      // 2. Delegate based on the Router's decision
      switch (routingDecision.route) {
        case "ACTION":
          logger.info(`[ChatService] Delegating to ACTION Pipeline (Reason: ${routingDecision.reason})`);
          // Execute the real MCP action pipeline
          // Role is set to 'admin' generically for now, or you could pass role through processQuery
          const actionText = await handleChatMessage({ userId, role: 'visitor', message: query });
          response = {
            answer: actionText,
            confidence: 0.99,
            sources: []
          };
          break;
          
        case "RAG":
          logger.info(`[ChatService] Delegating to RAG Pipeline (Reason: ${routingDecision.reason})`);
          response = await retrievalPipeline.execute(query);
          break;

        case "SMALL_TALK":
        case "GENERAL_CHAT":
        case "HYBRID":
          logger.info(`[ChatService] Delegating to Future Route (${routingDecision.route}). Defaulting to RAG for now.`);
          response = await retrievalPipeline.execute(query);
          break;

        default:
          logger.warn(`[ChatService] Unknown route "${routingDecision.route}". Defaulting to RAG.`);
          response = await retrievalPipeline.execute(query);
      }

      // 3. Append routing metadata for frontend telemetry
      const finalPayload = {
        ...response,
        _metadata: {
          route: routingDecision.route,
          routingConfidence: routingDecision.confidence,
          latencyMs: Date.now() - startMs
        }
      };

      logger.info(`[ChatService] Query processed successfully in ${finalPayload._metadata.latencyMs}ms.`);
      return finalPayload;

    } catch (error) {
      logger.error(`[ChatService] Unhandled error during processing: ${error.message}`, { stack: error.stack });
      throw new Error("Internal system error while processing query.");
    }
  }
}

const chatService = new ChatService();

module.exports = {
  chatService,
  ChatService
};
