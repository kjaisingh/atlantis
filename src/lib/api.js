async function request(path, options = {}) {
  let response;
  const timeout = AbortSignal.timeout(65_000);
  try {
    response = await fetch(`/api${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
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
  let body = null;
  try {
    if (contentType.includes('application/json')) body = await response.json();
  } catch (error) {
    throw new Error('Atlantis returned an incomplete response. Please try again.', {
      cause: error,
    });
  }
  if (!response.ok) {
    const retry = body?.resetAt
      ? ` Next allowance: ${new Date(body.resetAt).toLocaleString()}.`
      : '';
    throw new Error((body?.error || `Request failed (${response.status}).`) + retry);
  }
  if (body === null) throw new Error('Atlantis returned an invalid response.');
  return body;
}

export function getHealth(options) {
  return request('/health', options);
}

export function getAirports(options) {
  return request('/airports', options);
}

export function searchFlights(params) {
  return request('/search', { method: 'POST', body: JSON.stringify(params) });
}
