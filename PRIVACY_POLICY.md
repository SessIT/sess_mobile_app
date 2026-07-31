# SESS HR — Privacy Policy

**Effective date:** 30 July 2026 *(v1.1 — updated for chat media sharing, camera capture, celebrations, and punch reminders)*
**Company:** [SESS full legal company name], [registered address] ("we", "us", "the Company")
**App:** SESS HR (Android mobile app + web admin console)
**Contact for privacy questions:** [hr@yourdomain.com / phone]

Please read this policy carefully. By signing up and using the SESS HR app, you
confirm that you have read, understood, and agree to the collection and use of
your information as described below.

---

## 1. Who this app is for

SESS HR is an internal employee application provided by the Company to its
employees for attendance, leave management, and team communication. It is not a
public app; only registered employees (and, in future, authorised clients) can
log in.

## 2. Information we collect

### a) Profile and employment information
Provided by you or by HR when your account is created:

- Full name, employee ID, phone number, date of birth, blood group
- Residential address and emergency contact
- Designation, department, employment type, date of joining, reporting manager

### b) Statutory and payroll information *(visible to HR/Admin only)*
- PAN number, ESI number, EPF number
- Salary (CTC), bank name, account number, and IFSC code

This information is collected because the Company is legally required to
maintain it for payroll, ESI, EPF, and income-tax compliance.

### c) Attendance information
Each time you punch in or punch out, the app records:

- **Date and time** of the punch
- **Your GPS location** (latitude, longitude, accuracy) and the nearest address
- **A selfie photo** taken at the moment of punch (used to verify that you —
  and not someone else — performed the punch)
- The customer site you punched in at, and computed working hours / late status

### d) Location trail during working hours
While you are punched in, the app periodically records your GPS location to
maintain a work-hours movement trail (used for field-staff coordination and
attendance verification).

**Important limits, enforced by the system itself:**
- Location is recorded **only between your punch-in and punch-out**. The server
  rejects any location data sent outside a punch session.
- We do **not** track your location before punch-in, after punch-out, on
  leave days, on holidays, or on weekends.
- Your trail is visible only to you and to authorised admins.

### e) Login and verification data
- Your phone number and one-time passwords (OTPs) sent by SMS to log in.
  OTPs expire after a short time and cannot be reused.

### f) Chat messages and shared media
Messages you send in the in-app team chat (direct messages and group messages)
are stored on the Company server so they can be delivered and displayed. This
includes:

- Text messages, including **@mentions** of colleagues in group chats
- **Photos and videos you choose to share** — either picked from your gallery
  or taken with the camera inside the chat. These files are uploaded to and
  stored on the Company server so the recipient(s) can view them.

Chat is intended for work communication only. Only the participants of a chat
(or members of a group) can see its messages and media.

### g) Leave and holiday records
Your leave applications, leave balances, approvals/rejections, and attendance
correction requests.

### h) Celebrations (visible to colleagues)
To enable the team celebrations feature (birthday and work-anniversary wishes),
your **name, birthday (day and month only), work-anniversary date, and
designation** are shown to your colleagues on the app dashboard when the date
is coming up. Your birth *year* and age are not displayed.

## 3. Device permissions, and what we do NOT collect

**Camera** — used only when *you* choose to use it: taking the punch selfie, or
taking a photo to share in chat. The app never records photos, video, or audio
in the background.

**Photo gallery** — accessed only through your phone's own picker, and only
when you tap the share-media button in chat. The app receives **only the
file(s) you explicitly select**; it cannot browse, scan, or upload anything
else from your gallery.

**Notifications** — used for daily punch-in/punch-out reminders and message
alerts. Reminders are scheduled **on your own device**; declining notification
permission only means you won't receive reminders.

**Location** — see Section 2(c)/(d); never collected outside punch sessions.

What we do NOT collect:

- Your phone's contacts, call logs, SMS inbox, other apps, or files
- Any gallery content you did not explicitly select to share
- Location in the background outside working hours
- We do not use advertising trackers or analytics SDKs, and we do not show ads.

## 4. How we use your information

Your information is used only to:

1. Verify your identity and log you in (phone + OTP)
2. Record and verify attendance (punch time, location, selfie, geofence check)
3. Calculate working hours, late marks, and attendance reports
4. Process leave applications and maintain leave balances
5. Run payroll and meet statutory obligations (PF, ESI, PAN/tax)
6. Enable work-related team communication (chat, including photos/videos you
   choose to share and birthday/anniversary wishes)
7. Send you attendance reminders (daily punch-in/punch-out notifications)
8. Maintain employment records required by law

We do **not** sell, rent, or trade your personal information to anyone. We do
not share it with third parties, except:

- **SMS gateway provider** ([MSG91 / provider name]) — receives only your
  phone number, solely to deliver the login OTP
- **Government authorities** — where disclosure is required by law (e.g. PF,
  ESI, tax authorities, or a lawful order)

## 5. Who can see your information

Access is role-based and enforced by the server:

| Information | You | Your manager / Admin |
|---|---|---|
| Your profile (name, department, etc.) | ✅ | ✅ |
| Salary, bank, PAN/ESI/EPF details | ✅ (view own) | ✅ HR/Admin only |
| Your attendance, punch photos, location trail | ✅ | ✅ Admin only |
| Your chat messages & shared photos/videos | ✅ | Only participants of that chat / group |
| Your birthday (day/month) & work anniversary | ✅ | ✅ All colleagues (celebrations widget) |
| Other employees' personal data | ❌ | — |

## 6. How we protect your information (security measures)

- **Encryption in transit:** all communication between the app and our server
  uses HTTPS (TLS encryption). Nothing is sent as plain text over the network.
- **Login security:** access requires OTP verification to your registered
  phone number; sessions use signed authentication tokens (JWT). Admin
  passwords are stored only as bcrypt hashes — we cannot see them.
- **Secure storage on your phone:** your login token is kept in the phone's
  encrypted secure storage (Android Keystore), not in plain files.
- **Server security:** the database is not reachable from the internet — it
  accepts connections only from the application server itself. The server is
  firewalled so only web traffic (HTTPS) and administration access are open.
- **Role-based access:** the server checks your role on every request; an
  employee account cannot open admin data even if the request is crafted
  manually.
- **Backups:** encrypted-channel nightly backups are taken so your records
  are not lost, and old backups are automatically deleted after 14 days.

## 7. How long we keep your information

- **Employment, attendance, payroll, and statutory records:** retained for the
  duration of your employment and thereafter as required by Indian labour,
  tax, PF, and ESI laws (typically up to 8 years after exit).
- **Punch photos and location trails:** retained for [12 months / period you
  choose], then deleted.
- **OTP codes:** deleted/invalidated within minutes of issue.
- **Chat messages and shared photos/videos:** retained while your account is
  active; deletable by admin policy.

When retention periods end, data is deleted from the live system and expires
out of backups on the backup rotation schedule.

## 8. Your rights

You may, at any time, by contacting HR at [hr@yourdomain.com]:

- **Access** the personal information we hold about you (most of it is already
  visible in your "My Profile" and "My Attendance" screens)
- **Correct** inaccurate information (profile corrections, attendance
  correction requests are built into the app)
- **Request deletion** of personal data that we are not legally required to
  retain, after your employment ends
- **Withdraw consent** for app usage — note that because attendance and
  payroll depend on this system, withdrawing consent may affect the practical
  administration of your employment; talk to HR first
- **Raise a grievance** about how your data is handled; we will respond within
  [30] days

This policy is intended to align with the **Digital Personal Data Protection
Act, 2023 (India)** and applicable labour record-keeping laws.

## 9. Children

This app is for employees of the Company only and is not intended for anyone
under 18 years of age.

## 10. Changes to this policy

If we change this policy (for example, when we add task management or client
ticket features), we will notify you in the app and ask you to review the
updated version. The latest version is always available at
[https://hr.yourdomain.com/privacy].

## 11. Consent

By tapping **"I Agree"** during sign-up (or by continuing to use the app after
a policy update), you consent to the collection and use of your information as
described in this Privacy Policy.

---

*[SESS full legal company name]*
*[Registered address]*
*[Contact email / phone]*
