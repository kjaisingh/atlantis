export function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function formatAirportTime(value) {
  // Duffel timestamps describe each airport's local wall clock.
  const date = new Date(`${value.slice(0, 19)}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDuration(value) {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value || '');
  if (!match) return null;
  const hours = Number(match[1] || 0) * 24 + Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return [hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(' ') || null;
}
