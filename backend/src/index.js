require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Normalise a URL string: strip surrounding quotes and trailing slashes
function normaliseUrl(url) {
  return url.replace(/['"]/g, '').replace(/\/+$/, '');
}

// Build allowlist from FRONTEND_URL (supports comma-separated list)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(normaliseUrl).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, server-to-server, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some((o) => origin === o)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin} | Allowed: ${allowedOrigins.join(', ')}`);
    return callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Apply CORS to every route, including preflight OPTIONS
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // Express 5 compatible wildcard for preflight


app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI Personal Assistant / Digital Twin Backend is running.',
    timestamp: new Date(),
    allowedOrigins,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
