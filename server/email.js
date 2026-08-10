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
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

function buildEmail({ heading, body }) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #ee0979;">${heading}</h2>
      <p>${body}</p>
      <p style="color: #888; font-size: 12px;">Sent by Atlantis</p>
    </div>
  `;
}

async function sendEmail({ to, subject, heading, body }) {
  if (!transporter) {
    console.log('[email:mock]', { to, subject, heading, body });
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html: buildEmail({ heading, body }),
  });
}

export function sendPriceAlertEmail(subscription, itinerary) {
  return sendEmail({
    to: subscription.email,
    subject: `Atlantis found a match: ${subscription.origin} → ${subscription.destination}`,
    heading: 'We found a flight under your price threshold!',
    body: `
      ${itinerary.airline} — ${itinerary.path}<br>
      Departs ${itinerary.departureTime}, arrives ${itinerary.arrivalTime}<br>
      Price: $${itinerary.price} (threshold: $${subscription.price_threshold})<br>
      <a href="${itinerary.bookingLink}">Book on Kayak</a>
    `,
  });
}

export function sendExpiredEmail(subscription) {
  return sendEmail({
    to: subscription.email,
    subject: `Atlantis: no match found for ${subscription.origin} → ${subscription.destination}`,
    heading: 'Your subscription has expired',
    body: `We never found a flight under $${subscription.price_threshold} before the departure date. This subscription has been removed.`,
  });
}
