require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow the configured frontend origin (or all origins in development)
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL.replace(/['"]/g, '').replace(/\/$/, '')]
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

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
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
