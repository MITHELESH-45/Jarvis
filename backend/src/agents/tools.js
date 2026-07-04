const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const { checkAvailability, createAppointment, blockTimeSlot, deleteAppointment } = require('../services/calendarService');
const { sendEmail } = require('../services/gmailService');
const { prisma } = require('../db');

// ─── Tool: check_availability ───────────────────────────────────────────────
const checkAvailabilityTool = new DynamicStructuredTool({
  name: 'check_availability',
  description: 'Checks the calendar for busy time blocks on a given date (YYYY-MM-DD). Returns a list of busy slots so you can identify open meeting windows.',
  schema: z.object({
    date: z.string().describe('The date to check availability for, in YYYY-MM-DD format.'),
  }),
  func: async ({ date }) => {
    try {
      const busySlots = await checkAvailability(date);
      if (!busySlots || busySlots.length === 0) {
        return `The calendar is completely free on ${date}. No busy blocks found.`;
      }
      const formatted = busySlots
        .map((s) => `- From ${s.start} to ${s.end}${s.summary ? ` ("${s.summary}")` : ''}`)
        .join('\n');
      return `Busy slots on ${date}:\n${formatted}`;
    } catch (err) {
      console.error('[Tool: check_availability] Error:', err);
      return `Failed to check availability: ${err.message}`;
    }
  },
});

// ─── Tool: book_appointment ──────────────────────────────────────────────────
const bookAppointmentTool = new DynamicStructuredTool({
  name: 'book_appointment',
  description: 'Books a meeting appointment. Creates a Google Calendar event, saves it to the database, and sends confirmation emails to both the visitor and the admin.',
  schema: z.object({
    visitorName: z.string().describe('Full name of the visitor.'),
    visitorEmail: z.string().email().describe('Email address of the visitor.'),
    date: z.string().describe('Date of the meeting in YYYY-MM-DD format.'),
    startTime: z.string().describe('Start time in HH:MM:SS or ISO format.'),
    endTime: z.string().describe('End time in HH:MM:SS or ISO format.'),
    reason: z.string().describe('Purpose or agenda of the meeting.'),
  }),
  func: async ({ visitorName, visitorEmail, date, startTime, endTime, reason }) => {
    try {
      // Step 1: Create Google Calendar event
      const googleEventId = await createAppointment({ visitorName, visitorEmail, date, startTime, endTime, reason });

      // Step 2: Find the visitor's user record in the database
      const visitorUser = await prisma.user.findUnique({ where: { email: visitorEmail } });

      if (!visitorUser) {
        return `Appointment created in Google Calendar (Event ID: ${googleEventId}), but could not save to the database: no user found with email ${visitorEmail}. The visitor must sign in first.`;
      }

      // Step 3: Save to Prisma appointments table
      await prisma.appointment.create({
        data: {
          googleEventId,
          visitorId: visitorUser.id,
          visitorEmail,
          visitorName,
          appointmentDate: new Date(`${date}T00:00:00Z`),
          startTime: new Date(`${date}T${startTime.includes('T') ? startTime.split('T')[1] : startTime}`),
          endTime: new Date(`${date}T${endTime.includes('T') ? endTime.split('T')[1] : endTime}`),
          reason,
          status: 'scheduled',
        },
      });

      // Step 4: Send confirmation email to the visitor
      await sendEmail({
        to: visitorEmail,
        subject: `Your Meeting with Mithul is Confirmed — ${date}`,
        body: `
          <h2>Meeting Confirmed!</h2>
          <p>Hi ${visitorName},</p>
          <p>Your meeting has been successfully booked. Here are the details:</p>
          <ul>
            <li><strong>Date:</strong> ${date}</li>
            <li><strong>Time:</strong> ${startTime} – ${endTime} (UTC)</li>
            <li><strong>Reason:</strong> ${reason}</li>
          </ul>
          <p>If you have any questions, feel free to reach out at <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a>.</p>
          <p>Looking forward to meeting you!</p>
          <p><strong>Mithul</strong></p>
        `,
      });

      // Step 5: Send notification email to Admin
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `[New Appointment] ${visitorName} on ${date}`,
        body: `
          <h2>New Appointment Booked</h2>
          <ul>
            <li><strong>Visitor:</strong> ${visitorName} (${visitorEmail})</li>
            <li><strong>Date:</strong> ${date}</li>
            <li><strong>Time:</strong> ${startTime} – ${endTime} (UTC)</li>
            <li><strong>Reason:</strong> ${reason}</li>
            <li><strong>Google Event ID:</strong> ${googleEventId}</li>
          </ul>
        `,
      });

      return `Appointment successfully booked! Google Calendar Event ID: ${googleEventId}. Confirmation emails sent to ${visitorEmail} and ${process.env.ADMIN_EMAIL}.`;
    } catch (err) {
      console.error('[Tool: book_appointment] Error:', err);
      return `Failed to book appointment: ${err.message}`;
    }
  },
});

// ─── Tool: block_calendar_time (Admin-Only) ──────────────────────────────────
const blockCalendarTimeTool = new DynamicStructuredTool({
  name: 'block_calendar_time',
  description: 'Blocks out a personal time slot on the calendar as "Busy", preventing visitors from booking during this window. For admin use only.',
  schema: z.object({
    date: z.string().describe('Date in YYYY-MM-DD format.'),
    startTime: z.string().describe('Start time in HH:MM:SS or ISO format.'),
    endTime: z.string().describe('End time in HH:MM:SS or ISO format.'),
    title: z.string().describe('Label for the blocked slot, e.g. "Lunch Party" or "Personal Time".'),
  }),
  func: async ({ date, startTime, endTime, title }) => {
    try {
      const googleEventId = await blockTimeSlot({ date, startTime, endTime, title });
      return `Time slot "${title}" successfully blocked on ${date} from ${startTime} to ${endTime}. Google Event ID: ${googleEventId}.`;
    } catch (err) {
      console.error('[Tool: block_calendar_time] Error:', err);
      return `Failed to block time slot: ${err.message}`;
    }
  },
});

// ─── Tool: cancel_appointment (Admin-Only) ───────────────────────────────────
const cancelAppointmentTool = new DynamicStructuredTool({
  name: 'cancel_appointment',
  description: 'Cancels an existing appointment by its Google Calendar Event ID. Removes the calendar event, updates the database record to "cancelled", and emails the visitor. For admin use only.',
  schema: z.object({
    googleEventId: z.string().describe('The Google Calendar Event ID of the appointment to cancel.'),
  }),
  func: async ({ googleEventId }) => {
    try {
      // Step 1: Delete from Google Calendar
      await deleteAppointment(googleEventId);

      // Step 2: Update Prisma appointment status to 'cancelled' and retrieve visitor info
      const appointment = await prisma.appointment.update({
        where: { googleEventId },
        data: { status: 'cancelled' },
      });

      // Step 3: Send cancellation email to the visitor
      await sendEmail({
        to: appointment.visitorEmail,
        subject: `Your Meeting with Mithul Has Been Cancelled`,
        body: `
          <h2>Meeting Cancelled</h2>
          <p>Hi ${appointment.visitorName},</p>
          <p>We regret to inform you that your scheduled meeting has been cancelled.</p>
          <ul>
            <li><strong>Date:</strong> ${appointment.appointmentDate.toISOString().split('T')[0]}</li>
            <li><strong>Reason:</strong> ${appointment.reason}</li>
          </ul>
          <p>Please reach out to <a href="mailto:${process.env.ADMIN_EMAIL}">${process.env.ADMIN_EMAIL}</a> to reschedule at a convenient time.</p>
          <p>Apologies for the inconvenience.</p>
          <p><strong>Mithul's AI Assistant</strong></p>
        `,
      });

      return `Appointment with Google Event ID "${googleEventId}" has been cancelled. Database updated, and a cancellation email has been sent to ${appointment.visitorEmail}.`;
    } catch (err) {
      console.error('[Tool: cancel_appointment] Error:', err);
      return `Failed to cancel appointment: ${err.message}`;
    }
  },
});

module.exports = {
  checkAvailabilityTool,
  bookAppointmentTool,
  blockCalendarTimeTool,
  cancelAppointmentTool,
};
