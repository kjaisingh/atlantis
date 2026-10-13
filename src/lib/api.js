async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(65_000),
      ...options,
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new Error('Request timed out. Please try again.', { cause: error });
    }
    throw new Error('Could not reach Atlantis. Check your connection and try again.', {
      cause: error,
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status}).`);
  }
  if (body === null) throw new Error('Atlantis returned an invalid response.');
  return body;
}

export function getHealth() {
  return request('/health');
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
