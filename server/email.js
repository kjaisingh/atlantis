function emailHtml(text) {
  const escape = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  const content = text
    .split(/(https:\/\/[^\s]+)/g)
    .map((part) =>
      part.startsWith('https://') ? `<a href="${escape(part)}">${escape(part)}</a>` : escape(part),
    )
    .join('');
  return `<div style="font-family:sans-serif;white-space:pre-wrap;overflow-wrap:anywhere">${content}</div>`;
}

export class DeliveryError extends Error {
  constructor(ambiguous) {
    super('Email delivery is unavailable. Please try again later.');
    this.ambiguous = ambiguous;
  }
}

export function createMailer({ emailKey, emailFrom }, fetcher = fetch) {
  return async function send({ to, subject, text, key }) {
    let response;
    try {
      response = await fetcher('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': emailKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: 'Atlantis', email: emailFrom },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: emailHtml(text),
          headers: { idempotencyKey: key },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new DeliveryError(true);
    }
    if (!response.ok) {
      // A server error may occur after acceptance; never automatically resend it.
      throw new DeliveryError(response.status >= 500 || response.status === 408);
    }
  };
}
