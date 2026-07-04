const { google } = require('googleapis');
const { oauth2Client } = require('./googleAuth');

const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

/**
 * Sends an email using the Gmail API (with the authenticated 'me' user).
 * @param {Object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} params.subject - Email subject.
 * @param {string} params.body - Email body (can contain HTML or plain text).
 * @returns {Promise<Object>} - The Gmail API response data.
 */
async function sendEmail({ to, subject, body }) {
  try {
    // Encode the subject using UTF-8 Base64 encoding to prevent encoding issues with special characters
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

    // Construct RFC 822 formatted email message
    const messageParts = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];

    const message = messageParts.join('\r\n');

    // Base64url encode the raw message string
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
