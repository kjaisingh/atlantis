const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function calendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value ?? '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function numericInput(value) {
  return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : Number.NaN;
}

export function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isValidFutureDate(value, now = new Date()) {
  const date = calendarDate(value);
  return date !== null && date >= todayUtc(now);
}

export function validateTrip(body, airportSet, now = new Date()) {
  const origin = typeof body.origin === 'string' ? body.origin.trim().toUpperCase() : '';
  const destination =
    typeof body.destination === 'string' ? body.destination.trim().toUpperCase() : '';
  const departureDate = body.departureDate;
  const returnDate = body.returnDate ?? '';
  const travelers = numericInput(body.travelers);

  if (!airportSet.has(origin) || !airportSet.has(destination)) {
    return { error: 'Unknown origin or destination airport code.' };
  }
  if (airportCodes(origin).some((code) => airportCodes(destination).includes(code))) {
    return { error: 'Origin and destination must not include the same airport.' };
  }
  if (!isValidFutureDate(departureDate, now)) {
    return { error: 'Departure date must be a real, non-past calendar date.' };
  }
  if (returnDate !== '' && !isValidFutureDate(returnDate, now)) {
    return { error: 'Return date must be a real, non-past calendar date.' };
  }
  if (returnDate && calendarDate(returnDate) < calendarDate(departureDate)) {
    return { error: 'Return date must be on or after the departure date.' };
  }
  if (!Number.isInteger(travelers) || travelers < 1 || travelers > 9) {
    return { error: 'Travelers must be an integer between 1 and 9.' };
  }

  return { value: { origin, destination, departureDate, returnDate, travelers } };
}
import { airportCodes } from './route-graph.js';
