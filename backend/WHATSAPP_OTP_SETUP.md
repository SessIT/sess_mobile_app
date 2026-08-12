# WhatsApp OTP — Setup Guide (Meta WhatsApp Cloud API)

The app now sends a 6-digit WhatsApp code before an employee can create or
reset their login PIN. This guide gets the WhatsApp side working.

**Until you finish this setup, nothing is broken:** in dev mode (no
`WHATSAPP_TOKEN` in `.env`) the code is printed on the backend console, so you
can test the whole login flow today.

---

## How the flow works

```
Employee enters phone number
  → POST /auth/check-phone      (has PIN? → normal PIN login)
  → POST /auth/request-otp      (no PIN, or tapped "Forgot PIN")
      server → WhatsApp: "123456 is your verification code"
  → POST /auth/verify-otp       (code ok → 10-minute reset token)
  → POST /auth/set-pin          (reset token REQUIRED → PIN saved, logged in)
```

Protections built in: codes are bcrypt-hashed, single-use, expire in 5
minutes, allow 5 wrong guesses, and sends are throttled (60s cooldown,
max 8/day per phone).

---

## Part 1 — Test today (no Meta account)

1. Leave the `WHATSAPP_*` lines in `backend/.env` commented out.
2. Start the backend and watch its console.
3. In the app, enter a registered phone with no PIN (or tap **Forgot PIN?**).
4. The console prints: `[whatsapp] DEV MODE — ... OTP for +91XXXXXXXXXX: 123456`
5. Type that code in the app → set PIN → logged in.

---

## Part 2 — Real WhatsApp sending (production)

You need a **Meta developer app** connected to a **WhatsApp Business Account
(WABA)**. ~1–2 hours of clicking, mostly waiting for reviews.

### Step 1 — Meta Business Portfolio
1. Go to <https://business.facebook.com> → create a Business Portfolio for
   *Sri Easwari Scientific Solution Pvt Ltd* (or use the existing one).
2. Business Settings → Security Centre → start **Business Verification**
   (GST certificate / CIN works). Unverified businesses are capped at
   250 conversations/day — fine for testing, verify before launch.

### Step 2 — Developer app + WhatsApp
1. Go to <https://developers.facebook.com> → **Create App** → type **Business**.
2. In the app dashboard, **Add product → WhatsApp → Set up**, linking the
   Business Portfolio from Step 1.
3. Meta gives you a **test sender number** immediately + a temporary token.
   You can send to up to 5 whitelisted recipient numbers with it — good for a
   first end-to-end test.

### Step 3 — Real sender number
1. WhatsApp → API Setup → **Add phone number**.
2. Use a number that is **NOT running personal/normal WhatsApp** (it gets
   converted to API-only). A cheap spare SIM is the usual answer.
3. Verify it by SMS/voice call, set the display name (e.g. "SESS HR") — the
   display name goes through a short review.
4. Note the **Phone number ID** shown on the API Setup page (a long numeric
   id — NOT the phone number itself) → this is `WHATSAPP_PHONE_NUMBER_ID`.

### Step 4 — Create the OTP template
1. WhatsApp Manager → **Message templates** → Create template.
2. Category: **Authentication** (important — not Utility/Marketing).
3. Name: `sess_login_otp`  · Language: **English** (add Tamil later if wanted).
4. Code delivery: **Copy code** button. Meta auto-writes the body
   ("*{{1}} is your verification code*") — you cannot freetext an
   authentication template.
5. Submit — authentication templates usually approve in minutes.

> If you pick a different name/language, set `WHATSAPP_TEMPLATE` /
> `WHATSAPP_TEMPLATE_LANG` in `.env` to match.

### Step 5 — Permanent access token
The dashboard token expires in 24h. For the server you want a **system user**
token that never expires:

1. Business Settings → Users → **System users** → Add (name: `sess-hr-server`,
   role: Admin).
2. **Add assets** → Apps → select your app → Full control.
3. **Generate token** → select your app → tick permissions
   `whatsapp_business_messaging` + `whatsapp_business_management` →
   expiry **Never** → Generate.
4. Copy it once (it is never shown again) → this is `WHATSAPP_TOKEN`.

### Step 6 — Configure the backend
Uncomment and fill in `backend/.env`:

```env
WHATSAPP_TOKEN=EAAG...your-system-user-token
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_TEMPLATE=sess_login_otp
WHATSAPP_TEMPLATE_LANG=en
```

Restart the backend. Test with your own number via **Forgot PIN?** — the code
should arrive on WhatsApp within seconds.

---

## Costs (India)

- Authentication conversation: **~₹0.12 per OTP** (Meta's authentication rate
  for India) — billed to a card added in Business Settings → Billing.
- No TRAI DLT registration needed (that's only for SMS).
- Employees log in once per 90 days, so for 50 employees this is a few rupees
  a month.

## If WhatsApp delivery fails

- The employee sees "Could not send the WhatsApp code" — the server console
  logs the exact Meta error (`[whatsapp] send failed: ...`).
- Common causes: template not approved yet, recipient number not on WhatsApp,
  unverified business hit the daily cap, expired token (use the system-user
  token, not the dashboard one).
- Fallback for a stuck employee: an admin can clear their PIN is **not**
  built — the employee's number must receive WhatsApp. Keep the admin
  password login as the escape hatch for admins themselves.

## Alternative providers

If you'd rather not touch Meta directly, BSPs like **MSG91, AiSensy,
Interakt, or Twilio** resell the same API with their own dashboards (slightly
higher per-message cost). Only `backend/lib/whatsapp.js` would need changing —
the rest of the flow is provider-agnostic.
