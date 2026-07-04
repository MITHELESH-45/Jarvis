require('dotenv').config();
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const z = require('zod');

const {
  checkAvailability,
  createAppointment,
  blockTimeSlot,
  deleteAppointment,
} = require('../services/calendarService');
const { sendEmail } = require('../services/gmailService');
const { prisma } = require('../db');

const MCP_PORT = process.env.MCP_PORT || 5001;

// ─── Initialize MCP Server ────────────────────────────────────────────────────
const server = new McpServer({
  name: 'jarvis-google-tools',
  version: '1.0.0',
});

// ─── Tool: check_availability ─────────────────────────────────────────────────
server.tool(
  'check_availability',
  'Checks the Google Calendar for busy slots on a given date. Returns a list of occupied time blocks.',
  { date: z.string().describe('Date to check in YYYY-MM-DD format.') },
  async ({ date }) => {
    try {
      const busySlots = await checkAvailability(date);
      if (!busySlots || busySlots.length === 0) {
        return { content: [{ type: 'text', text: `The calendar is completely free on ${date}. No busy blocks found.` }] };
      }
      const formatted = busySlots
        .map((s) => `- From ${s.start} to ${s.end}${s.summary ? ` ("${s.summary}")` : ''}`)
        .join('\n');
      return { content: [{ type: 'text', text: `Busy slots on ${date}:\n${formatted}` }] };
    } catch (err) {
      console.error('[MCP Tool: check_availability]', err);
      return { content: [{ type: 'text', text: `Failed to check availability: ${err.message}` }], isError: true };
    }
  }
);

// ─── Tool: book_appointment ───────────────────────────────────────────────────
server.tool(
  'book_appointment',
  'Books a meeting: creates a Google Calendar event, saves it to the database, and sends confirmation emails to the visitor and admin.',
  {
    visitorName:  z.string().describe('Full name of the visitor.'),
    visitorEmail: z.string().email().describe('Email address of the visitor.'),
    date:         z.string().describe('Meeting date in YYYY-MM-DD format.'),
    startTime:    z.string().describe('Start time in HH:MM:SS format.'),
    endTime:      z.string().describe('End time in HH:MM:SS format.'),
    reason:       z.string().describe('Purpose or agenda of the meeting.'),
  },
  async ({ visitorName, visitorEmail, date, startTime, endTime, reason }) => {
    try {
      // 1. Create Google Calendar event
      const googleEventId = await createAppointment({ visitorName, visitorEmail, date, startTime, endTime, reason });

      // 2. Find visitor's user record
      const visitorUser = await prisma.user.findUnique({ where: { email: visitorEmail } });
      if (!visitorUser) {
        return {
          content: [{
            type: 'text',
            text: `Appointment created in Google Calendar (ID: ${googleEventId}), but could not save to database — no user found with email ${visitorEmail}. The visitor must sign in first.`,
          }],
        };
      }

      // 3. Save to PostgreSQL
      await prisma.appointment.create({
        data: {
          googleEventId,
          visitorId: visitorUser.id,
          visitorEmail,
          visitorName,
          appointmentDate: new Date(`${date}T00:00:00Z`),
          startTime: new Date(`${date}T${startTime}`),
          endTime: new Date(`${date}T${endTime}`),
          reason,
          status: 'scheduled',
        },
      });

      // 4. Confirmation email to visitor
      await sendEmail({
        to: visitorEmail,
        subject: `Your Meeting with Mithul is Confirmed — ${date}`,
        body: `<h2>Meeting Confirmed!</h2><p>Hi ${visitorName},</p><p>Your meeting has been successfully booked.</p><ul><li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${startTime} – ${endTime} (UTC)</li><li><strong>Reason:</strong> ${reason}</li></ul><p>Contact: <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a></p><p><strong>Mithul's AI Assistant</strong></p>`,
      });

      // 5. Notification email to admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `[New Appointment] ${visitorName} on ${date}`,
        body: `<h2>New Appointment Booked</h2><ul><li><strong>Visitor:</strong> ${visitorName} (${visitorEmail})</li><li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${startTime} – ${endTime} (UTC)</li><li><strong>Reason:</strong> ${reason}</li><li><strong>Google Event ID:</strong> ${googleEventId}</li></ul>`,
      });

      return {
        content: [{
          type: 'text',
          text: `Appointment successfully booked! Google Calendar Event ID: ${googleEventId}. Confirmation emails sent to ${visitorEmail} and ${process.env.ADMIN_EMAIL}.`,
        }],
      };
    } catch (err) {
      console.error('[MCP Tool: book_appointment]', err);
      return { content: [{ type: 'text', text: `Failed to book appointment: ${err.message}` }], isError: true };
    }
  }
);

// ─── Tool: block_calendar_time (Admin) ───────────────────────────────────────
server.tool(
  'block_calendar_time',
  'Blocks a personal time slot on Google Calendar as "Busy". Admin use only.',
  {
    date:      z.string().describe('Date in YYYY-MM-DD format.'),
    startTime: z.string().describe('Start time in HH:MM:SS format.'),
    endTime:   z.string().describe('End time in HH:MM:SS format.'),
    title:     z.string().describe('Label for the blocked slot, e.g. "Lunch Party".'),
  },
  async ({ date, startTime, endTime, title }) => {
    try {
      const googleEventId = await blockTimeSlot({ date, startTime, endTime, title });
      return {
        content: [{
          type: 'text',
          text: `Time slot "${title}" blocked on ${date} from ${startTime} to ${endTime}. Google Event ID: ${googleEventId}.`,
        }],
      };
    } catch (err) {
      console.error('[MCP Tool: block_calendar_time]', err);
      return { content: [{ type: 'text', text: `Failed to block time slot: ${err.message}` }], isError: true };
    }
  }
);

// ─── Tool: cancel_appointment (Admin) ────────────────────────────────────────
server.tool(
  'cancel_appointment',
  'Cancels an existing appointment by its Google Event ID. Removes from Google Calendar, marks database record as cancelled, and emails the visitor. Admin use only.',
  { googleEventId: z.string().describe('The Google Calendar Event ID of the appointment to cancel.') },
  async ({ googleEventId }) => {
    try {
      // 1. Remove from Google Calendar
      await deleteAppointment(googleEventId);

      // 2. Update DB and get visitor info
      const appointment = await prisma.appointment.update({
        where: { googleEventId },
        data: { status: 'cancelled' },
      });

      // 3. Send cancellation email to visitor
      await sendEmail({
        to: appointment.visitorEmail,
        subject: `Your Meeting with Mithul Has Been Cancelled`,
        body: `<h2>Meeting Cancelled</h2><p>Hi ${appointment.visitorName},</p><p>Your scheduled meeting has been cancelled.</p><ul><li><strong>Date:</strong> ${appointment.appointmentDate.toISOString().split('T')[0]}</li><li><strong>Reason:</strong> ${appointment.reason}</li></ul><p>Please contact <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a> to reschedule.</p><p><strong>Mithul's AI Assistant</strong></p>`,
      });

      return {
        content: [{
          type: 'text',
          text: `Appointment "${googleEventId}" cancelled. Database updated. Cancellation email sent to ${appointment.visitorEmail}.`,
        }],
      };
    } catch (err) {
      console.error('[MCP Tool: cancel_appointment]', err);
      return { content: [{ type: 'text', text: `Failed to cancel appointment: ${err.message}` }], isError: true };
    }
  }
);

// ─── Express + SSE Transport Setup ───────────────────────────────────────────
const app = express();

// Map to hold active transports keyed by session ID
const transports = new Map();

// SSE connection endpoint — clients connect here to open the event stream
app.get('/sse', async (req, res) => {
  console.log('[MCP Server] New SSE connection established.');
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);

  res.on('close', () => {
    console.log(`[MCP Server] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// Message endpoint — clients POST JSON-RPC messages here
app.post('/messages', express.json(), async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: `No active SSE session found for ID: ${sessionId}` });
  }
  await transport.handlePostMessage(req, res);
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Jarvis MCP Google Tools Server', port: MCP_PORT });
});

app.listen(MCP_PORT, () => {
  console.log(`[MCP Server] Jarvis Google Tools MCP Server running on http://localhost:${MCP_PORT}`);
  console.log(`[MCP Server] SSE endpoint: http://localhost:${MCP_PORT}/sse`);
});
