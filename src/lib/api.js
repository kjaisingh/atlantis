async function request(path, options) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || 'Request failed.');
  }
  return body;
}

export function getAirports() {
  return request('/airports');
}

export function searchFlights(params) {
  return request('/search', { method: 'POST', body: JSON.stringify(params) });
}

export function subscribe(params) {
  return request('/subscribe', { method: 'POST', body: JSON.stringify(params) });
}
