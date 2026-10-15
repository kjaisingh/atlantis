const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
function isEmail(value) {
  if (!value || value.length > 254 || /\s/u.test(value)) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const dot = value.indexOf('.', at + 2);
  return dot > at + 1 && dot < value.length - 1;
}

function calendarDate(value) {
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
  const returnDate = body.returnDate || '';
  const travelers = Number(body.travelers);

  if (!airportSet.has(origin) || !airportSet.has(destination)) {
    return { error: 'Unknown origin or destination airport code.' };
  }
  if (origin === destination) {
    return { error: 'Origin and destination must differ.' };
  }
  if (!isValidFutureDate(departureDate, now)) {
    return { error: 'Departure date must be a real, non-past calendar date.' };
  }
  if (returnDate && !isValidFutureDate(returnDate, now)) {
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

export function validateSubscriber(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const priceThreshold = Number(body.priceThreshold);
  const currency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : '';

  if (!name || name.length > 120 || !isEmail(email)) {
    return { error: 'A valid name and email are required.' };
  }
  if (!Number.isFinite(priceThreshold) || priceThreshold <= 0 || priceThreshold > 1_000_000) {
    return { error: 'Price threshold must be between 0 and 1,000,000.' };
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return { error: 'Currency must be a three-letter ISO code.' };
  }
  return { value: { name, email, priceThreshold, currency } };
}
