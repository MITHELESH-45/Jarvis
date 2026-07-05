const express = require("express");
const { chatController } = require("../controllers/chat.controller");

const router = express.Router();

/**
 * @route   POST /api/chat
 * @desc    Submit a user query to the Jarvis Digital Twin. 
 *          The system will dynamically route to either RAG or Action pipelines.
 * @access  Public (or protected by API Gateway / middleware in higher layers)
 */
router.post("/", chatController.handleQuery.bind(chatController));

module.exports = router;
