require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const chatRouter = require('./routes/chat');

const app = express();



function normaliseUrl(url) {
  return url.replace(/['"]/g, '').replace(/\/+$/, '');
}

// Build allowlist from FRONTEND_URL (supports comma-separated list)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(normaliseUrl).filter(Boolean)
  : ['http:

const corsOptions = {
  origin: (origin, callback) => {
    
    if (!origin) return callback(null, true);
    if (allowedOrigins.some((o) => origin === o)) return callback(null, true);
    console.warn(`[CORS] Blocked origin: ${origin} | Allowed: ${allowedOrigins.join(', ')}`);
    return callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, 
};


app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); 


app.use(express.json());


app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);


app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI Personal Assistant / Digital Twin Backend is running.',
    timestamp: new Date(),
    allowedOrigins,
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Server] CORS allowed origins: ${allowedOrigins.join(', ')}`);
});
