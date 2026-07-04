const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { handleChatMessage } = require('../agents/orchestrator');
const { prisma } = require('../db');

const router = express.Router();

/**
 * @route  GET /api/chat/history
 * @desc   Returns the full chat history for the authenticated user (oldest first).
 * @access Protected
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { timestamp: 'asc' },
    });
    return res.json(messages);
  } catch (err) {
    console.error('[GET /api/chat/history] Error:', err);
    return res.status(500).json({ error: 'Failed to load chat history.' });
  }
});

/**
 * @route  POST /api/chat
 * @desc   Send a message to the AI Digital Twin and receive a streaming text response.
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

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const responseText = await handleChatMessage({ userId, role, message: message.trim() });

    const words = responseText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const chunk = i === 0 ? words[i] : ' ' + words[i];
      res.write(chunk);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    res.end();
  } catch (err) {
    console.error('[POST /api/chat] Error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'The AI assistant encountered an internal error. Please try again.' });
    }
    res.end();
  }
});

module.exports = router;
