require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'AI Personal Assistant / Digital Twin Backend is running.',
    timestamp: new Date()
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server successfully started on port ${PORT}`);
});
