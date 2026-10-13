import nodemailer from 'nodemailer';

const hasSmtp = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM,
);
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  : null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
}

async function sendEmail({ to, subject, heading, htmlBody, textBody, messageId }) {
  if (!transporter) {
    throw new Error('SMTP is not configured; notification was not sent.');
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    messageId,
    text: `${heading}\n\n${textBody}\n\nSent by Atlantis`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#ec1a78">${escapeHtml(heading)}</h2>${htmlBody}<p style="color:#888;font-size:12px">Sent by Atlantis</p></div>`,
  });
}

function legSummary(itinerary, label) {
  const safe = {
    label: escapeHtml(label),
    airline: escapeHtml(itinerary.airline),
    path: escapeHtml(itinerary.path),
    departure: escapeHtml(itinerary.departureTime),
    arrival: escapeHtml(itinerary.arrivalTime),
    link: escapeHtml(itinerary.bookingLink),
  };
  return {
    html: `<p><strong>${safe.label}</strong>: ${safe.airline}, ${safe.path}<br>Departs ${safe.departure}, arrives ${safe.arrival}<br><a href="${safe.link}">Review on Kayak</a></p>`,
    text: `${label}: ${itinerary.airline}, ${itinerary.path}\nDeparts ${itinerary.departureTime}, arrives ${itinerary.arrivalTime}\n${itinerary.bookingLink}`,
  };
}

export function sendPriceAlertEmail(subscription, outbound, inbound, totalPrice) {
  const outboundSummary = legSummary(outbound, 'Outbound');
  const inboundSummary = inbound ? legSummary(inbound, 'Return') : null;
  const price = formatMoney(totalPrice, subscription.currency);
  const threshold = formatMoney(subscription.price_threshold, subscription.currency);
  return sendEmail({
    to: subscription.email,
    subject: `Atlantis found a match: ${subscription.origin} → ${subscription.destination}`,
    heading: 'We found a flight under your price threshold',
    messageId: `<price-${subscription.id}@atlantis.local>`,
    htmlBody: `${outboundSummary.html}${inboundSummary?.html ?? ''}<p>Total: ${escapeHtml(price)} (threshold: ${escapeHtml(threshold)})</p>`,
    textBody: `${outboundSummary.text}${inboundSummary ? `\n\n${inboundSummary.text}` : ''}\n\nTotal: ${price} (threshold: ${threshold})`,
  });
}

export function sendExpiredEmail(subscription) {
  const threshold = formatMoney(subscription.price_threshold, subscription.currency);
  return sendEmail({
    to: subscription.email,
    subject: `Atlantis: no match found for ${subscription.origin} → ${subscription.destination}`,
    heading: 'Your price alert has expired',
    messageId: `<expired-${subscription.id}@atlantis.local>`,
    htmlBody: `<p>We did not find a flight below ${escapeHtml(threshold)} before departure. This alert has been removed.</p>`,
    textBody: `We did not find a flight below ${threshold} before departure. This alert has been removed.`,
  });
}
