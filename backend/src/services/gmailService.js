const { google } = require('googleapis');
const { oauth2Client } = require('./googleAuth');

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

async function sendEmail({ to, subject, body }) {
  try {
    
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

    
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];

    const message = messageParts.join('\r\n');

    
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error sending email via Gmail API:', error);
    throw new Error(`Gmail sendEmail failed: ${error.message}`);
  }
}

module.exports = {
  sendEmail,
};
