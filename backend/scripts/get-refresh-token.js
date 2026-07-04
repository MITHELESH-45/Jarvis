require('dotenv').config();
const { google } = require('googleapis');
const express = require('express');

const PORT = 5000;
const app = express();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// We need scopes for Calendar access, Gmail sending, and basic profile info
const scopes = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // Crucial to request offline access to obtain a refresh token
  prompt: 'consent',      // Forces Google to show the consent screen so a refresh token is returned
  scope: scopes
});

let server;

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    res.send('Authorization failed. No code returned.');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n========================================================================');
    console.log('   SUCCESSFULLY RETRIEVED OAUTH TOKENS!');
    console.log('========================================================================');
    console.log('Copy this refresh token to your GOOGLE_REFRESH_TOKEN in .env:\n');
    console.log(tokens.refresh_token);
    console.log('========================================================================\n');

    res.send('<h1>Authorization successful!</h1><p>You can close this tab now and check your terminal for the refresh token.</p>');
    
    // Shut down the server gracefully
    setTimeout(() => {
      console.log('Shutting down helper server...');
      server.close();
      process.exit(0);
    }, 1500);
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send('Error exchanging code for tokens.');
  }
});

server = app.listen(PORT, () => {
  console.log('========================================================================');
  console.log('          GOOGLE OAUTH REFRESH TOKEN HELPER GENERATOR');
  console.log('========================================================================');
  console.log('1. Open the following URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Authorize the application and grant permissions (Calendar & Gmail).');
  console.log(`3. Google will redirect you, and the script will print the refresh token.`);
  console.log('========================================================================\n');
});
