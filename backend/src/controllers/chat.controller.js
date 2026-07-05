const { chatService } = require("../services/chat.service");
const { logger } = require("../rag/logger/index.js");

class ChatController {
  
    async handleQuery(req, res, next) {
    try {
      const { query } = req.body;

      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        logger.warn("[ChatController] Rejected request: Missing or invalid query payload.");
        return res.status(400).json({
          success: false,
          error: "Invalid request payload. 'query' string is required.",
        });
      }

      if (query.length > 2000) {
        logger.warn("[ChatController] Rejected request: Query exceeds maximum length.");
        return res.status(413).json({
          success: false,
          error: "Query too long. Maximum length is 2000 characters.",
        });
      }

      
      const responsePayload = await chatService.processQuery(query);

      
      return res.status(200).json({
        success: true,
        data: responsePayload
      });

    } catch (error) {
      logger.error(`[ChatController] Exception caught in HTTP layer: ${error.message}`);
      
      
      return res.status(500).json({
        success: false,
        error: "An internal server error occurred while processing your request.",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

const chatController = new ChatController();

module.exports = {
  chatController,
  ChatController
};
