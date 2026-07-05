const { google } = require('googleapis');
const { oauth2Client } = require('./googleAuth');

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });


const IST_OFFSET = '+05:30';
const TIMEZONE   = 'Asia/Kolkata';

function toISTISOString(timeVal, dateStr) {
  if (!timeVal || !dateStr) throw new Error(`toISTISOString: missing timeVal or dateStr (got: ${timeVal}, ${dateStr})`);

  
  if (timeVal.includes('T')) {
    return new Date(timeVal).toISOString();
  }

  
  const timePart = timeVal.length === 5 ? `${timeVal}:00` : timeVal; 
  return new Date(`${dateStr}T${timePart}${IST_OFFSET}`).toISOString();
}

async function checkAvailability(dateStr) {
  try {
    
    const startOfDay = new Date(`${dateStr}T00:00:00${IST_OFFSET}`);
    const endOfDay   = new Date(`${dateStr}T23:59:59${IST_OFFSET}`);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    return events.map((event) => ({
      eventId: event.id,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      summary: event.summary,
      description: event.description || '',
    }));
  } catch (error) {
    console.error(`Error checking availability for date ${dateStr}:`, error);
    throw new Error(`Google Calendar checkAvailability failed: ${error.message}`);
  }
}

/**
 * Checks whether a proposed [startTime, endTime] slot on a given date
 * overlaps with any existing Google Calendar event.
 *
 * @param {string} dateStr   - Date in YYYY-MM-DD (IST)
 * @param {string} startTime - Start time in HH:MM:SS (IST)
 * @param {string} endTime   - End time in HH:MM:SS (IST)
 * @returns {Promise<{hasConflict: boolean, conflictingEvent?: string}>}
 */
async function checkConflict(dateStr, startTime, endTime) {
  const proposedStart = new Date(toISTISOString(startTime, dateStr));
  const proposedEnd   = new Date(toISTISOString(endTime, dateStr));

  const existing = await checkAvailability(dateStr);

  for (const slot of existing) {
    const slotStart = new Date(slot.start);
    const slotEnd   = new Date(slot.end);

    // Overlap condition: proposed starts before slot ends AND proposed ends after slot starts
    const overlaps = proposedStart < slotEnd && proposedEnd > slotStart;
    if (overlaps) {
      return {
        hasConflict: true,
        conflictingEvent: slot.summary || 'Existing Event',
      };
    }
  }

  return { hasConflict: false };
}

async function createAppointment(details) {
  try {
    
    const startDateTime = toISTISOString(details.startTime, details.date);
    const endDateTime   = toISTISOString(details.endTime, details.date);

    const event = {
      summary: `Meeting with Mithelesh (Visitor: ${details.visitorName})`,
      description: `Reason: ${details.reason}\nVisitor Email: ${details.visitorEmail}`,
      start: {
        dateTime: startDateTime,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDateTime,
        timeZone: TIMEZONE,
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
      sendUpdates: 'all',
      resource: event,
    });

    return response.data.id;
  } catch (error) {
    console.error('Error creating Google Calendar appointment:', error);
    throw new Error(`Google Calendar createAppointment failed: ${error.message}`);
  }
}

async function blockTimeSlot(details) {
  try {
    const startDateTime = toISTISOString(details.startTime, details.date);
    const endDateTime   = toISTISOString(details.endTime, details.date);

    const event = {
      summary: details.title || 'Blocked Time Slot',
      transparency: 'opaque',
      start: {
        dateTime: startDateTime,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endDateTime,
        timeZone: TIMEZONE,
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
  checkConflict,
  createAppointment,
  blockTimeSlot,
  deleteAppointment,
  toISTISOString,
};
