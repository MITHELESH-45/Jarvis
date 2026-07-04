const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyGoogleToken } = require('../middleware/auth');
const { prisma } = require('../db');

const router = express.Router();

/**
 * @route POST /api/auth/google
 * @desc Exchange Google ID Token for an application session JWT
 * @access Public
 */
router.post('/google', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Google ID token is required' });
    }

    // 1. Verify Google token using our helper
    let payload;
    try {
      payload = await verifyGoogleToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    // 2. Upsert user in database
    const user = await prisma.user.upsert({
      where: { googleId: payload.googleId },
      update: {
        name: payload.name,
        pictureUrl: payload.pictureUrl,
      },
      create: {
        googleId: payload.googleId,
        email: payload.email,
        name: payload.name,
        pictureUrl: payload.pictureUrl,
        role: payload.email === process.env.ADMIN_EMAIL ? 'admin' : 'visitor',
      },
    });

    // 3. Generate custom session JWT token
    const sessionToken = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // 4. Return user details and the session token
    return res.status(200).json({
      user,
      token: sessionToken,
    });
  } catch (error) {
    console.error('Google authentication route error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

module.exports = router;
