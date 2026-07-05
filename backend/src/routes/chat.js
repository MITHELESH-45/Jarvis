const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { chatService } = require('../services/chat.service');
const { prisma } = require('../db');

const router = express.Router();

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

router.post('/', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({ error: 'A non-empty "message" string is required.' });
    }

    const userId = req.user.id;
    const role = req.user.role || 'visitor';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    
    const responsePayload = await chatService.processQuery(message.trim(), userId, role);
    const responseText = responsePayload.answer || "I'm sorry, I encountered an error.";

    
    await prisma.chatMessage.createMany({
      data: [
        { userId, sender: 'user', message: message.trim() },
        { userId, sender: 'assistant', message: responseText },
      ],
    });

    
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
      return res.status(500).json({ error: 'The AI assistant encountered an internal error.' });
    }
    res.end();
  }
});

module.exports = router;
