const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { handleChatMessage } = require('../agents/orchestrator');

const router = express.Router();

/**
 * @route  POST /api/chat
 * @desc   Send a message to the AI Digital Twin and receive a response.
 * @access Protected (requires valid JWT via requireAuth middleware)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'A non-empty "message" string is required in the request body.' });
    }

    const userId = req.user.id;
    const role = req.user.role;

    const response = await handleChatMessage({ userId, role, message: message.trim() });

    return res.status(200).json({ response });
  } catch (err) {
    console.error('[POST /api/chat] Error:', err);
    return res.status(500).json({ error: 'The AI assistant encountered an internal error. Please try again.' });
  }
});

module.exports = router;
