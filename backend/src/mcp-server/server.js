require('dotenv').config();
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const z = require('zod');

const {
  checkAvailability,
  checkConflict,
  createAppointment,
  blockTimeSlot,
  deleteAppointment,
  toISTISOString,
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
  'Returns the list of FREE 1-hour appointment slots available on a given date between 08:00 and 17:00 IST. Each slot is exactly 1 hour long. Slots that overlap with existing calendar events are excluded.',
  { date: z.string().describe('Date to check in YYYY-MM-DD format (IST).') },
  async ({ date }) => {
    try {
      // Fetch all booked/busy events for the day
      const busySlots = await checkAvailability(date);

      // Working-hours window: 08:00 – 17:00 IST (9 possible 1-hour slots)
      const WORK_START_H = 8;   // 08:00
      const WORK_END_H   = 17;  // 17:00 (last slot starts at 16:00)
      const IST_OFFSET   = '+05:30';

      // Build every candidate 1-hour slot
      const allSlots = [];
      for (let h = WORK_START_H; h < WORK_END_H; h++) {
        const hh    = String(h).padStart(2, '0');
        const hhEnd = String(h + 1).padStart(2, '0');
        allSlots.push({
          label:  `${hh}:00 – ${hhEnd}:00 IST`,
          start:  new Date(`${date}T${hh}:00:00${IST_OFFSET}`),
          end:    new Date(`${date}T${hhEnd}:00:00${IST_OFFSET}`),
          startStr: `${hh}:00:00`,
          endStr:   `${hhEnd}:00:00`,
        });
      }

      // Remove any slot that overlaps with a busy event
      const freeSlots = allSlots.filter((slot) => {
        return !busySlots.some((busy) => {
          const busyStart = new Date(busy.start);
          const busyEnd   = new Date(busy.end);
          // Overlap: slot starts before busy ends AND slot ends after busy starts
          return slot.start < busyEnd && slot.end > busyStart;
        });
      });

      if (freeSlots.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No available slots on ${date}. The calendar is fully booked between 08:00 and 17:00 IST.`,
          }],
        };
      }

      const slotList = freeSlots
        .map((s, i) => `  ${i + 1}. ${s.label}`)
        .join('\n');

      return {
        content: [{
          type: 'text',
          text: `Available 1-hour appointment slots on ${date} (IST):\n${slotList}\n\nEach slot is exactly 1 hour. Appointments are only accepted between 08:00 and 17:00 IST. To book, please share your preferred slot, name, email, and the purpose of the meeting.`,
        }],
      };
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
      // 0. Conflict check — reject if the slot overlaps any existing event
      const { hasConflict, conflictingEvent } = await checkConflict(date, startTime, endTime);
      if (hasConflict) {
        return {
          content: [{
            type: 'text',
            text: `Cannot book: the requested slot (${startTime}–${endTime} IST on ${date}) overlaps with an existing event: "${conflictingEvent}". Please choose a different time.`,
          }],
        };
      }

      // 1. Create Google Calendar event (times are treated as IST internally)
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

      // 3. Save to PostgreSQL — store times as IST-aware UTC timestamps
      //    toISTISOString returns a UTC ISO string (e.g. 2026-07-05T08:30:00.000Z for 14:00 IST)
      //    which is correct because Prisma/Postgres stores DateTime in UTC
      await prisma.appointment.create({
        data: {
          googleEventId,
          visitorId: visitorUser.id,
          visitorEmail,
          visitorName,
          appointmentDate: new Date(`${date}T00:00:00${'+05:30'}`),
          startTime: new Date(toISTISOString(startTime, date)),
          endTime:   new Date(toISTISOString(endTime, date)),
          reason,
          status: 'scheduled',
        },
      });

      // 4. Confirmation email to visitor (show IST times as-is from LLM)
      await sendEmail({
        to: visitorEmail,
        subject: `Your Meeting with Mithelesh is Confirmed — ${date}`,
        body: `<h2>Meeting Confirmed!</h2><p>Hi ${visitorName},</p><p>Your meeting has been successfully booked.</p><ul><li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${startTime} – ${endTime} (IST)</li><li><strong>Reason:</strong> ${reason}</li></ul><p>Contact: <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a></p><p><strong>Mithelesh's AI Assistant</strong></p>`,
      });

      // 5. Notification email to admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `[New Appointment] ${visitorName} on ${date}`,
        body: `<h2>New Appointment Booked</h2><ul><li><strong>Visitor:</strong> ${visitorName} (${visitorEmail})</li><li><strong>Date:</strong> ${date}</li><li><strong>Time:</strong> ${startTime} – ${endTime} (IST)</li><li><strong>Reason:</strong> ${reason}</li><li><strong>Google Event ID:</strong> ${googleEventId}</li></ul>`,
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

      // 2. Fetch visitor info before deleting
      const appointment = await prisma.appointment.findUnique({
        where: { googleEventId },
      });
      if (!appointment) {
        return { content: [{ type: 'text', text: `No appointment found with Google Event ID: ${googleEventId}.` }] };
      }

      // 3. Permanently delete from DB
      await prisma.appointment.delete({ where: { googleEventId } });

      // 4. Send cancellation email to visitor
      await sendEmail({
        to: appointment.visitorEmail,
        subject: `Your Meeting with Mithelesh Has Been Cancelled`,
        body: `<h2>Meeting Cancelled</h2><p>Hi ${appointment.visitorName},</p><p>Your scheduled meeting has been cancelled.</p><ul><li><strong>Date:</strong> ${appointment.appointmentDate.toISOString().split('T')[0]}</li><li><strong>Reason:</strong> ${appointment.reason}</li></ul><p>Please contact <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a> to reschedule.</p><p><strong>Mithelesh's AI Assistant</strong></p>`,
      });

      return {
        content: [{
          type: 'text',
          text: `Appointment "${googleEventId}" cancelled and removed from database. Cancellation email sent to ${appointment.visitorEmail}.`,
        }],
      };
    } catch (err) {
      console.error('[MCP Tool: cancel_appointment]', err);
      return { content: [{ type: 'text', text: `Failed to cancel appointment: ${err.message}` }], isError: true };
    }
  }
);

// ─── Tool: cancel_appointments_by_date (Admin) ────────────────────────────────
server.tool(
  'cancel_appointments_by_date',
  'Cancels ALL scheduled appointments for a given date (YYYY-MM-DD). Deletes each Google Calendar event, marks them as cancelled in the database, and sends a cancellation email to every affected visitor. Admin use only.',
  { date: z.string().describe('The date to cancel all appointments for, in YYYY-MM-DD format.') },
  async ({ date }) => {
    try {
      // Use IST-aware day boundaries: 00:00:00+05:30 to 23:59:59+05:30
      const startOfDay = new Date(`${date}T00:00:00+05:30`);
      const endOfDay   = new Date(`${date}T23:59:59+05:30`);

      const appointments = await prisma.appointment.findMany({
        where: {
          appointmentDate: { gte: startOfDay, lte: endOfDay },
          status: 'scheduled',
        },
      });

      if (!appointments || appointments.length === 0) {
        return { content: [{ type: 'text', text: `No scheduled appointments found for ${date}. Nothing was cancelled.` }] };
      }

      const results = [];

      for (const appt of appointments) {
        try {
          // Delete from Google Calendar
          await deleteAppointment(appt.googleEventId);

          // Permanently delete from DB
          await prisma.appointment.delete({ where: { id: appt.id } });

          // Send cancellation email
          const apptDateStr = date; // use the IST date passed by caller, not UTC-shifted ISO
          await sendEmail({
            to: appt.visitorEmail,
            subject: `Your Meeting with Mithelesh on ${apptDateStr} Has Been Cancelled`,
            body: `<h2>Meeting Cancelled</h2><p>Hi ${appt.visitorName},</p><p>We regret to inform you that your scheduled meeting has been cancelled.</p><ul><li><strong>Date:</strong> ${apptDateStr}</li><li><strong>Reason for meeting:</strong> ${appt.reason}</li></ul><p>We sincerely apologise for the inconvenience. Please reach out to <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a> to reschedule at a convenient time.</p><p>Sorry for the inconvenience.</p><p><strong>Mithelesh's AI Assistant</strong></p>`,
          });

          results.push(`✓ Cancelled & deleted: ${appt.visitorName} (${appt.visitorEmail}) — email sent.`);
        } catch (innerErr) {
          console.error(`[MCP Tool: cancel_appointments_by_date] Failed for ${appt.googleEventId}:`, innerErr);
          results.push(`✗ Failed: ${appt.visitorName} (${appt.visitorEmail}) — ${innerErr.message}`);
        }
      }

      return {
        content: [{
          type: 'text',
          text: `Cancelled & removed ${appointments.length} appointment(s) for ${date}:\n${results.join('\n')}`,
        }],
      };
    } catch (err) {
      console.error('[MCP Tool: cancel_appointments_by_date]', err);
      return { content: [{ type: 'text', text: `Failed to cancel appointments for ${date}: ${err.message}` }], isError: true };
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

  // Set response timeout to 10 minutes to survive long LLM tool calls
  res.setTimeout(600000);
  req.setTimeout(600000);

  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);

  // Heartbeat: send a comment every 15s to keep the SSE stream alive
  // and prevent proxy/Node.js from closing the connection due to inactivity
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(heartbeat);
    console.log(`[MCP Server] SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });

  await server.connect(transport);
});

// Message endpoint — clients POST JSON-RPC messages here.
// IMPORTANT: Do NOT add express.json() here. The SSEServerTransport.handlePostMessage()
// reads the raw body stream itself. Pre-parsing it with express.json() consumes the
// stream and causes "InternalServerError: stream is not readable" (HTTP 400).
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    console.warn(`[MCP Server] POST /messages — no active session for ID: ${sessionId}`);
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
