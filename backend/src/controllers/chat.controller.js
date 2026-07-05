const { chatService } = require("../services/chat.service");
const { logger } = require("../rag/logger/index.js");

/**
 * Chat Controller
 * 
 * Purpose: Handles the Express.js HTTP lifecycle for the central chat endpoint.
 * Architecture: Keeps business logic out of the controller. Handles input validation, 
 *               response formatting, and HTTP error code mapping.
 */
class ChatController {
  
  /**
   * Main endpoint handler for user queries.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  async handleQuery(req, res, next) {
    try {
      const { query } = req.body;

      // 1. Input Validation
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

      // 2. Delegate to Service Layer
      const responsePayload = await chatService.processQuery(query);

      // 3. Standardized Output
      return res.status(200).json({
        success: true,
        data: responsePayload
      });

    } catch (error) {
      logger.error(`[ChatController] Exception caught in HTTP layer: ${error.message}`);
      
      // Pass to global error handler (if configured), otherwise return 500
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
