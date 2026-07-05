const { RouterAgent } = require("../router/routerAgent");
const { retrievalPipeline } = require("../rag/retrievalPipeline");
const { logger } = require("../rag/logger/index.js");
const { handleChatMessage } = require("../agents/orchestrator");

class ChatService {
  constructor() {
    this.routerAgent = new RouterAgent();
  }

    async processQuery(query, userId, role = 'visitor') {
    const startMs = Date.now();
    logger.info(`[ChatService] Received new query: "${query}" (User: ${userId}, Role: ${role})`);

    try {
      
      const routingDecision = await this.routerAgent.route(query);

      let response;

      
      switch (routingDecision.route) {
        case "ACTION":
          logger.info(`[ChatService] Delegating to ACTION Pipeline (Reason: ${routingDecision.reason})`);
          
          const actionText = await handleChatMessage({ userId, role, message: query });
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
