const { google } = require('googleapis');
const { oauth2Client } = require('./googleAuth');

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/**
 * Normalizes input date/time parameters into an ISO string.
 * @param {string|Date} timeVal - The time value (either a Date object, ISO string, or time string like "HH:MM:SS").
 * @param {string} [dateStr] - The date string "YYYY-MM-DD" if combining with a time string.
 * @returns {string} - ISO string format.
 */
function normalizeDateTime(timeVal, dateStr) {
  if (timeVal instanceof Date) {
    return timeVal.toISOString();
  }
  if (typeof timeVal === 'string') {
    if (timeVal.includes('T')) {
      return new Date(timeVal).toISOString();
    }
    if (dateStr) {
      return new Date(`${dateStr}T${timeVal}`).toISOString();
    }
  }
  return new Date(timeVal).toISOString();
}

/**
 * Checks busy slots for a given date (YYYY-MM-DD).
 * @param {string} dateStr - Date formatted as YYYY-MM-DD.
 * @returns {Promise<Array<{start: string, end: string}>>}
 */
async function checkAvailability(dateStr) {
  try {
    const startOfDay = new Date(`${dateStr}T00:00:00Z`);
    const endOfDay = new Date(`${dateStr}T23:59:59Z`);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    return events.map((event) => ({
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      summary: event.summary, // Included for debugging/AI context
    }));
  } catch (error) {
    console.error(`Error checking availability for date ${dateStr}:`, error);
    throw new Error(`Google Calendar checkAvailability failed: ${error.message}`);
  }
}

/**
 * Creates a new calendar appointment.
 * @param {Object} details
 * @param {string} details.visitorName
 * @param {string} details.visitorEmail
 * @param {string} details.date - YYYY-MM-DD
 * @param {string|Date} details.startTime
 * @param {string|Date} details.endTime
 * @param {string} details.reason
 * @returns {Promise<string>} - The Google Calendar Event ID.
 */
async function createAppointment(details) {
  try {
    const startDateTime = normalizeDateTime(details.startTime, details.date);
    const endDateTime = normalizeDateTime(details.endTime, details.date);

    const event = {
      summary: `Meeting with ${details.visitorName}`,
      description: `Reason: ${details.reason}\nVisitor Email: ${details.visitorEmail}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC',
      },
      attendees: [
        { email: details.visitorEmail, displayName: details.visitorName }
      ],
      reminders: {
        useDefault: true,
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data.id;
  } catch (error) {
    console.error('Error creating Google Calendar appointment:', error);
    throw new Error(`Google Calendar createAppointment failed: ${error.message}`);
  }
}

/**
 * Blocks out a specific time slot on the calendar.
 * @param {Object} details
 * @param {string} details.date - YYYY-MM-DD
 * @param {string|Date} details.startTime
 * @param {string|Date} details.endTime
 * @param {string} details.title
 * @returns {Promise<string>} - The Google Calendar Event ID.
 */
async function blockTimeSlot(details) {
  try {
    const startDateTime = normalizeDateTime(details.startTime, details.date);
    const endDateTime = normalizeDateTime(details.endTime, details.date);

    const event = {
      summary: details.title || 'Blocked Time Slot',
      transparency: 'opaque', // Marks time as "Busy"
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC',
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    return response.data.id;
  } catch (error) {
    console.error('Error blocking time slot on Google Calendar:', error);
    throw new Error(`Google Calendar blockTimeSlot failed: ${error.message}`);
  }
}

/**
 * Deletes an existing calendar event.
 * @param {string} googleEventId
 * @returns {Promise<void>}
 */
async function deleteAppointment(googleEventId) {
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
  } catch (error) {
    console.error(`Error deleting Google Calendar event ${googleEventId}:`, error);
    throw new Error(`Google Calendar deleteAppointment failed: ${error.message}`);
  }
}

module.exports = {
  checkAvailability,
  createAppointment,
  blockTimeSlot,
  deleteAppointment,
};
