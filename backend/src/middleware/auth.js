const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { prisma } = require('../db');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token and returns the user payload.
 * @param {string} token - The Google ID token.
 * @returns {Promise<{googleId: string, email: string, name: string, pictureUrl: string}>}
 */
async function verifyGoogleToken(token) {
  const ticket = await client.verifyIdToken({
    idToken: token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error('No payload returned from Google token verification');
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    pictureUrl: payload.picture,
  };
}

/**
 * Express middleware to verify the custom session JWT token and attach user to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header is missing or malformed' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token missing' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
    console.error('Authentication middleware error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

module.exports = {
  verifyGoogleToken,
  requireAuth,
};
