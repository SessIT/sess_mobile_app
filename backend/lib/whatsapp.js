// WhatsApp OTP delivery — Meta WhatsApp Cloud API (graph.facebook.com).
//
// Setup (see backend/WHATSAPP_OTP_SETUP.md for the step-by-step guide):
//   WHATSAPP_TOKEN            System-user access token (whatsapp_business_messaging)
//   WHATSAPP_PHONE_NUMBER_ID  Sender phone-number id from the WhatsApp app dashboard
//   WHATSAPP_TEMPLATE         Approved AUTHENTICATION template name (default sess_login_otp)
//   WHATSAPP_TEMPLATE_LANG    Template language code (default en)
//
// DEV FALLBACK: when WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set,
// the code is printed on the server console instead of being sent, so login
// keeps working on a dev laptop with no Meta account. The fallback can never
// kick in by accident in production — if the env vars are set, WhatsApp is used.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

const configured = () =>
  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// Send a 6-digit login code to +91<phone>'s WhatsApp.
// -> { ok:true, dev?:true } on success, { ok:false, error } on failure.
async function sendOtp(phone, code) {
  if (!configured()) {
    // Fail CLOSED in production: never fall back to printing live OTPs to the
    // server log if the WhatsApp env vars are missing/misconfigured on a real
    // deployment. The console fallback is a dev-only convenience.
    if (process.env.NODE_ENV === 'production') {
      console.error('[whatsapp] NOT CONFIGURED in production — refusing to send OTP. Set WHATSAPP_TOKEN & WHATSAPP_PHONE_NUMBER_ID.');
      return { ok: false, error: 'WhatsApp is not configured' };
    }
    console.log(`[whatsapp] DEV MODE — no WHATSAPP_TOKEN set. OTP for +91${phone}: ${code}`);
    return { ok: true, dev: true };
  }
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '91' + phone, // app collects 10-digit Indian mobile numbers
        type: 'template',
        template: {
          name: process.env.WHATSAPP_TEMPLATE || 'sess_login_otp',
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [
            // AUTHENTICATION templates take the code twice: once for the
            // message body and once for the tap-to-copy button.
            { type: 'body', parameters: [{ type: 'text', text: code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
          ],
        },
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[whatsapp] send failed:', r.status, JSON.stringify(data?.error || data));
      return { ok: false, error: data?.error?.message || `WhatsApp API error (${r.status})` };
    }
    return { ok: true };
  } catch (e) {
    console.error('[whatsapp] send failed:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendOtp, configured };
