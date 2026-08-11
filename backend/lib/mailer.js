// Email OTP delivery — plain SMTP via Nodemailer.
//
// Works with any SMTP provider. Recommended: Brevo free tier (300 mails/day,
// good inbox delivery) or a Gmail app password for quick testing.
//
// .env:
//   SMTP_HOST   e.g. smtp-relay.brevo.com  /  smtp.gmail.com
//   SMTP_PORT   587 (STARTTLS, default) or 465 (TLS)
//   SMTP_USER   SMTP login
//   SMTP_PASS   SMTP key / app password
//   SMTP_FROM   Sender, e.g. "SESS HR <no-reply@yourdomain.com>" (default SMTP_USER)
//
// DEV FALLBACK: with no SMTP_HOST set, the code is printed on the server
// console instead of being sent — same convention as lib/whatsapp.js. In
// production a missing config fails closed (never logs a live OTP).

const nodemailer = require('nodemailer');

const configured = () =>
  !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
    });
  }
  return transporter;
};

// Send a 6-digit login code to the employee's email.
// -> { ok:true, dev?:true } on success, { ok:false, error } on failure.
async function sendOtpEmail(email, code) {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[mailer] NOT CONFIGURED in production — refusing to send OTP. Set SMTP_HOST, SMTP_USER & SMTP_PASS.');
      return { ok: false, error: 'Email is not configured' };
    }
    console.log(`[mailer] DEV MODE — no SMTP_HOST set. OTP for ${email}: ${code}`);
    return { ok: true, dev: true };
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `${code} is your SESS login code`,
      text:
        `Your SESS Employee login code is: ${code}\n\n` +
        `It expires in 5 minutes. If you didn't request this, you can ignore this email.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:420px">` +
        `<p>Your <b>SESS Employee</b> login code is:</p>` +
        `<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:12px 0">${code}</p>` +
        `<p style="color:#6B7280;font-size:13px">It expires in 5 minutes. If you didn't request this, you can ignore this email.</p>` +
        `</div>`,
    });
    return { ok: true };
  } catch (e) {
    console.error('[mailer] send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// Mask for UI hints: "paramanantham79@gmail.com" -> "pa•••@gmail.com"
const maskEmail = (email) => {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 2)}•••@${domain}`;
};

module.exports = { sendOtpEmail, configured, maskEmail };
