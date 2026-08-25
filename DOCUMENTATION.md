# SESS HR — Project Documentation

HR & attendance system for **Sri Easwari Scientific Solutions Pvt Ltd**, built as three parts sharing one backend:

| Part | Folder | Stack | Who uses it |
|---|---|---|---|
| Employee mobile app | `mobile/` | Expo SDK 57 · React Native 0.86 · React 19 | All employees (and admins, who also get admin screens) |
| Admin web console | `web/` | React 18 · Vite 5 · Tailwind 3 · React Router 6 | Admins only |
| API server | `backend/` | Express 5 · Prisma 6 · PostgreSQL | Both clients |

All business time is **IST (Asia/Kolkata)**; the database stores UTC instants and both clients convert on render. Everything is mounted under `/api/*` on port **4000**.

---

## 1. Repository layout

```
mobile-app/
├── backend/
│   ├── server.js              # Express app: CORS, JSON (10mb), /uploads static, health, route mounts
│   ├── middleware/auth.js     # requireAuth (JWT bearer), requireRole
│   ├── lib/                   # prisma.js, mailer.js (email OTP), whatsapp.js (retired), leaveWorked.js
│   ├── routes/                # 15 routers: auth, me, users, attendance, location, holidays,
│   │                          #   leaves, ot, compoff, sites, geo, reports, chat, notes, expenses
│   ├── prisma/                # schema.prisma (18 models) + 22 migrations
│   ├── uploads/               # attendance/ chat/ expenses/ notes/  (served statically)
│   └── WHATSAPP_OTP_SETUP.md  # STALE — OTP now goes by email, not WhatsApp
├── mobile/
│   ├── App.js                 # Single native stack, 31 routes; boot gate from SecureStore
│   ├── screens/               # 30 screen files (documented below)
│   ├── components/            # ui.js (GradientHeader, BottomNav, Card, ...), widgets.js
│   ├── lib/                   # api.js, auth.js, notifications.js, theme.js, tracker.js, useKeyboard.js
│   ├── app.json / eas.json    # Expo config (still placeholder name/slug "mobile", no app IDs)
│   └── assets/                 
├── web/
│   ├── src/App.jsx            # Router: 1 public + 11 protected routes (+ Reports, commented out)
│   ├── src/pages/             # 13 pages (documented below)
│   ├── src/components/        # Layout (sidebar), ProtectedRoute, ui.jsx, icons.jsx
│   ├── src/lib/               # api.js, auth.jsx, format.js (IST formatters)
│   ├── vite.config.js         # port 5173, proxies /api + /uploads → :4000
│   └── DEPLOYMENT.md          # Full VPS production guide (Caddy + PM2 + Postgres)
├── PRIVACY_POLICY.md
└── SESS_HR_Security_and_Pending_Issues.docx
```

---

## 2. Core concepts (shared by all three parts)

**Login model.** Employees sign in on mobile with **email → 4-digit PIN** (first time: emailed 6-digit OTP → set PIN). Admins sign in with **username + password** — on the web console always, on mobile via the "admin" mode of the Login screen. PIN logins issue a **90-day** JWT; password logins a **1-day** JWT. Tokens carry `{ sub, username, roles: [name] }`.

**Roles.** Nine role names exist in the DB, but authorization is effectively **binary: `Admin` vs everyone else**. The backend guards admin endpoints with `requireRole('Admin')`; the mobile app only *hides* admin tiles (`roles.includes('Admin')`), and the web console rejects non-admins at `ProtectedRoute`. The server is the real authority. There is no manager-tier authorization anywhere ("reporting manager" is a display field only).

**Punching & geofence.** A punch-in requires a live selfie + GPS fix. The punch is allowed only inside an active **Site** geofence: haversine distance ≤ `radiusM + min(GPS accuracy, 200 m)`. Checked on the client (for instant feedback) *and* on the server (authoritative). **If no active sites exist, the geofence is off and punching is allowed anywhere** — the web Sites page shows a warning badge for this state.

**Approval workflow pattern.** Leave, Overtime, Comp-off, Expenses, and Attendance-corrections all follow the same shape: employee raises a request (mobile) → admin approves/rejects with an optional review note (mobile approvals screen or web page) → employee sees status + note. Statuses: `pending / approved / rejected` (comp-off adds `revoked`).

**Chat is HTTP polling, not websockets.** Threads poll every 4 s with an `?after=<lastMessageId>` cursor; conversation lists every 15 s. There is no socket.io anywhere.

**Uploads.** Files live under `backend/uploads/` and are served **without authentication** at `/uploads/...`. Attendance selfies arrive as base64 in the punch body; chat/notes/expense files go through multer `POST .../upload` endpoints that validate mimetype and size, then the create endpoint receives only the returned path.

---

## 3. Mobile app (`mobile/`) — screen-wise

### 3.1 App shell

- **`App.js`** — one `createNativeStackNavigator` (React Navigation 7), `headerShown: false` everywhere; screens draw their own headers (most via the shared `GradientHeader`; Dashboard and Login use their own inline gradients). On boot it reads SecureStore: a saved, unexpired token → start at `Dashboard`, else `Login`.
- There is **no real tab bar**: `components/ui.js` → `BottomNav` is a 4-button bar that `navigate()`s to **Punch · TaskList · ChatList · MyProfile**.
- **31 routes over 30 files.** Two naming quirks to know:
  - route **`MyProfile`** renders **`ProfileMenuScreen`** (the tile-grid hub), and route **`ProfileDetail`** renders **`MyProfileScreen`** (the actual profile form);
  - routes **`Terms`** and **`Privacy`** both render **`LegalScreen`** with different `initialParams.doc`.

### 3.2 Shared libraries (`mobile/lib/`)

| File | Purpose |
|---|---|
| `api.js` | Fetch wrapper: `api(path, opts)` adds `Authorization: Bearer <token>` + JSON headers, throws `Error` with `.status` on failure; `apiUpload` for multipart. `API_URL` is a hardcoded LAN address (`http://192.168.68.111:4000/api`) — **do not change it** (team rule); it must be repointed only at deploy time. |
| `auth.js` | SecureStore session under key `sess_auth`: `saveAuth / getAuth / clearAuth`. |
| `notifications.js` | Local daily punch reminders (09:15 in / 18:30 out) via `expo-notifications`; degrades gracefully in Expo Go. |
| `theme.js` | Design tokens: primary indigo `#1E3A8A`, semantic colors, gradients, radius, shadows. |
| `tracker.js` | GPS trail while punched in: a fix every 5 min, reverse-geocoded, queued in AsyncStorage (cap 500), batch-flushed 100 at a time to `POST /location/log`. |
| `useKeyboard.js` | Measures true keyboard lift on Android OEM keyboards so bottom composers sit correctly. |

### 3.3 Shared components (`mobile/components/`)

- **`ui.js`** — `GradientHeader` (indigo gradient header with back button/title/right slot), `BottomNav`, `Card`, `Chip` (status pill), `PrimaryButton`, `SectionLabel`, `HeaderIconButton`, `Upcoming` (placeholder body).
- **`widgets.js`** — `HolidayWidget` (next holiday) and `CelebrationsWidget` (upcoming birthdays/anniversaries). **Currently commented out** in `ProfileMenuScreen.js`, so both are dead at runtime.

### 3.4 Screens — Auth & home

#### `Login.js` — route `Login`
Multi-step sign-in. Modes: `phone` (email entry) → `pin` or `otp` → `setpin`, plus a separate `admin` username/password mode.
- Email identity check with masked-email hint; 4-digit PIN auto-submits on the 4th digit; 6-digit emailed OTP auto-submits on the 6th; first-time PIN creation and forgot-PIN reset (10-minute reset token); resend cooldown countdown; admin password login with show/hide.
- **API:** `POST /auth/check-phone`, `/auth/request-otp`, `/auth/verify-otp`, `/auth/verify-pin`, `/auth/set-pin`, `/auth/login`.
- On success: `saveAuth()` → `navigation.replace('Dashboard')`. Gear icon opens `MoreSettings` pre-login (legal pages).

#### `DashboardScreen.js` — route `Dashboard`
Post-login home: greeting, date, role chips, avatar, and a "Today Tasks" **placeholder** card. Registers punch reminders and notification-tap routing; polls `GET /chat/unread-count` every 15 s for the bell dot. Navigates to Notifications, MyProfile, TaskList + BottomNav. *All roles.*

#### `ProfileMenuScreen.js` — route `MyProfile` (the real navigation hub)
Avatar hero + tile grid.
- **MY WORKSPACE** tiles: ProfileDetail, MyAttendance, Leave, Overtime, CompOff, Expense, Holidays, TaskList, Notes (with unread badge).
- **ADMIN · MANAGEMENT** tiles (only when `roles` includes `Admin`): Users, TeamAttendance, TeamTrail, LeaveApprovals, OtApprovals, CompOffApprovals, ExpenseApprovals, LeavePolicy, Sites (Customer Sites), SendNote.
- **API:** `GET /me/profile`, `GET /chat/unread-count`, `GET /notes/unread-count` (refetched on focus).

#### `MyProfileScreen.js` — route `ProfileDetail`
Personal profile. Read-only EMPLOYMENT block (employee ID, joined, type, reporting manager, phone) + editable PERSONAL block (address, 10-digit emergency contact, blood group picker, DOB calendar). **API:** `GET /me/profile`, `PATCH /me/profile`. *All roles.*

### 3.5 Screens — Attendance & location

#### `PunchScreen.js` — route `Punch` (tab) — the app's centerpiece
Selfie + GPS punch in/out.
- Live clock; today's sessions with total hours; silent-shutter selfie (base64, q0.3); fast location prefetch (last-known → fresh fix, 10 s cap, 60 s refresh); client-side geofence mirroring the backend (shows distance to nearest site when blocked); 90-second location-freshness gate; hard "NO LOCATION = NO PUNCH" modal; per-session detail modal with in/out photos, addresses, accuracy; offline GPS-queue counter; site-name entry (default `SESS`); starts/stops `lib/tracker` based on an open session.
- **API:** `GET /attendance/today`, `GET /sites`, `POST /attendance/punch-in`, `POST /attendance/punch-out`.
- *All employees.*

#### `MyAttendanceScreen.js` — route `MyAttendance`
My monthly calendar + day drill-down. Per-day status colors; arrival policy mirrored client-side (≤09:30 on-time, 09:31–09:40 grace, ≥09:41 late); month stats (present/late/leave/absent/weekoff/holiday, worked vs required hours); day sessions with punch photos; **raise a missed-punch correction** (HH:MM in/out + reason).
- **API:** `GET /attendance/my-month`, `GET /attendance/my-day`, `GET /attendance/corrections/my`, `POST /attendance/corrections`. *All employees.*

#### `TeamAttendanceScreen.js` — route `TeamAttendance` — largest screen (~1000 lines)
Admin attendance console with three modes: **day | month | corrections**.
- Day roster (present / on-duty / absent, holiday-aware); month summary for all employees or day-by-day for one; **CSV export** (three layouts) via expo-file-system + expo-sharing; full **session CRUD** (manual create/edit/delete of punch sessions, bypasses geofence by design); correction review with status filters and pending badge — approving applies the corrected punches.
- **API:** `GET /users`, `GET /attendance/admin/day`, `/admin/month`, `/admin/day-sessions`, `POST /attendance/admin/session`, `PATCH|DELETE /attendance/admin/session/:id`, `GET /attendance/admin/corrections`, `PATCH /attendance/admin/corrections/:id`. *Admin.*

#### `TeamTrailScreen.js` — route `TeamTrail`
Admin GPS trail viewer: one employee, one date. Timeline of 5-minute points with addresses, **gap markers** (>8 min between captures), "recovered" flags (received >10 min after capture), suspicious-point count, CSV export/share.
- **API:** `GET /users`, `GET /location/user/:id?date=`. *Admin.*

#### `SitesScreen.js` — route `Sites`
Admin management of the customer-site geofences (mobile counterpart of the web Sites page). List of all sites (active + inactive) with address, coordinates, radius, and an active toggle; "Geofence OFF" warning when no active sites exist; edit and delete (with confirm) per site. The add/edit sheet sets the location three ways: **place search** (debounced, via the backend `/geo/search` Nominatim proxy), **paste "lat, lng"** from Google Maps, or **"Use my current location"** (expo-location GPS fix, which also prefills the address by reverse geocoding). Radius input clamped 20–5000 m to match the backend.
- **API:** `GET /sites?all=1`, `POST /sites`, `PATCH /sites/:id`, `DELETE /sites/:id`, `GET /geo/search?q=`. *Admin.*

### 3.6 Screens — Leave, OT, comp-off, expenses (employee ↔ approver pairs)

#### `LeaveScreen.js` — route `Leave` *(employee)*
Balance cards per type (CL / SL / PL / CO), request history with status chips + review notes, cancel pending, apply sheet (type, from/to calendar, half-day toggle for same-day ranges, reason).
- **API:** `GET /leaves/my?year=`, `POST /leaves/requests`, `DELETE /leaves/requests/:id`.

#### `LeaveApprovalsScreen.js` — route `LeaveApprovals` *(admin)*
Filters (pending/approved/rejected/all), employee picker, from/to window; approve/reject with confirm dialog and optional review note.
- **API:** `GET /users`, `GET /leaves/requests`, `PATCH /leaves/requests/:id/decision`.

#### `LeavePolicyScreen.js` — route `LeavePolicy`
Yearly per-type quotas with year stepper and dirty-state guard. **Read-only for non-admins.** Comp-off is excluded by design (earned, not allocated).
- **API:** `GET /leaves/policy?year=`, `PUT /leaves/policy`.

#### `OvertimeScreen.js` — route `Overtime` *(employee)*
OT is requested **in advance**. Month stepper, approved/pending hour totals, OT calendar, history with "Added by admin" tags, cancel pending; request sheet with quick slots (1–4 h) and 12-hour AM/PM entry (handles crossing midnight).
- **API:** `GET /ot/my?month=`, `POST /ot/requests`, `DELETE /ot/requests/:id`.

#### `OtApprovalsScreen.js` — route `OtApprovals` *(admin)*
Review + **grant**: approve/reject pending requests, and an Add-OT modal that grants pre-approved OT to many employees at once (select-all; reports created/skipped).
- **API:** `GET /users`, `GET /ot/requests`, `PATCH /ot/requests/:id/decision`, `POST /ot/grant`.

#### `CompOffScreen.js` — route `CompOff` *(employee)*
Comp-off credit for working a Sunday or holiday (1 credit = 1 day of CO leave). Balance (earned/used/pending/available), request list with a punch-evidence line, cancel pending; request sheet whose calendar dots the holidays (Sunday/holiday eligibility itself is enforced server-side).
- **API:** `GET /compoff/my?year=`, `POST /compoff/requests`, `DELETE /compoff/requests/:id`, `GET /holidays?year=`.

#### `CompOffApprovalsScreen.js` — route `CompOffApprovals` *(admin)*
Per-request punch verdict banner (NOT PUNCHED / short of 09:30–18:30 / full day); approve dialog warns when punch evidence is weak; **revoke** an already-approved credit.
- **API:** `GET /users`, `GET /compoff/requests`, `PATCH /compoff/requests/:id/decision`, `PATCH /compoff/admin/:id/revoke`.

#### `ExpenseScreen.js` — route `Expense` *(employee)*
Expense claims have **no amount field — the attached bill is the amount**. Type picker (server list with hardcoded fallback), from/to filter, claim cards with bill thumbnails (images in-app, PDFs via system open), withdraw pending; submit sheet uploads **up to 5 bills** (gallery multi-select or camera, 5 MB each) then posts type + details + bill paths.
- **API:** `GET /expenses/my`, `GET /expenses/types`, `POST /expenses/upload`, `POST /expenses`, `DELETE /expenses/:id`.

#### `ExpenseApprovalsScreen.js` — route `ExpenseApprovals` *(admin)*
Status filters, employee picker, month **or** day-range filter (mutually exclusive), bill viewer, approve/reject modal collecting a review note.
- **API:** `GET /users`, `GET /expenses/requests`, `PATCH /expenses/requests/:id/decision`.

### 3.7 Screens — Communication

#### `ChatListScreen.js` — route `ChatList` (tab)
Conversation list (1:1 + groups) with unread badges, search, relative timestamps, 15 s polling while focused; create-group modal (name + members).
- **API:** `GET /chat/conversations`, `POST /chat/groups`.

#### `ChatScreen.js` — route `Chat`
Thread view (1:1 or group, chosen by `route.params.user` vs `.group`). 4 s incremental polling (`?after=`), smart auto-scroll + jump-to-latest FAB, day separators, **@mentions** with member suggestions and self-mention highlighting (groups), photo/video sharing with preview-and-caption step (25 MB cap), full-screen image viewer, keyboard-aware composer, `prefill` param support.
- **API:** `GET /chat/thread/:userId`, `GET /chat/group-thread/:groupId`, `POST /chat/upload`, `POST /chat/send`.

#### `NotificationsScreen.js` — route `Notifications`
Notification center: unread conversations as cards (client-filtered from `/chat/conversations`), plus a display-only daily-reminder card and an Expo Go warning when local notifications are unavailable.

#### `NotesScreen.js` — route `Notes` *(employee)*
Two kinds in one list: read-only **admin notices** (no reply path; opening the screen marks them read) and private **self-notes** (editable/deletable, optional photo).
- **API:** `GET /notes`, `PATCH /notes/read`, `POST /notes`, `PATCH|DELETE /notes/:id`, `POST /notes/upload`.

#### `SendNoteScreen.js` — route `SendNote` *(admin)*
One-way notices to employees. COMPOSE tab (multi-select active employees, write, send) and SENT tab (per-recipient read/unread, withdraw).
- **API:** `GET /users`, `POST /notes/send`, `GET /notes/sent`, `DELETE /notes/sent/:id`.

### 3.8 Screens — User management *(admin)*

#### `UserScreen.js` — route `Users`
Employee directory: search (name/username/phone), active count, role chips, pull-to-refresh; per-user action sheet → Edit or Activate/Deactivate; header button → CreateUser.
- **API:** `GET /users`, `PATCH /users/:id/status`.

#### `CreateUserScreen.js` — route `CreateUser`
New account: username (lowercased, no spaces), full name, **email (required — it's the login identity)**, optional 10-digit phone, password ≥6 + confirm, role picker. Success alert shows the auto-generated `SESS-nnn` employee ID.
- **API:** `GET /users/roles`, `POST /users`.

#### `EditUserScreen.js` — route `EditUser`
Same fields for an existing user; blank password = keep current; email only sent when changed; role reassignment.
- **API:** `GET /users/roles`, `PATCH /users/:id`.

### 3.9 Screens — Static & placeholder

| Screen | Route | Status |
|---|---|---|
| `TaskListScreen.js` | `TaskList` (tab) | **Placeholder** — "Upcoming" card + ghost rows, no API calls. |
| `HolidaysScreen.js` | `Holidays` | Live. Upcoming/full-year toggle for everyone; admins also get year stepper, add-holiday sheet, delete. API: `GET /holidays?year=`, `GET /holidays/upcoming`, `POST /holidays`, `DELETE /holidays/:id`. |
| `MoreSettingsScreen.js` | `MoreSettings` | Terms / Privacy / Logout + version chip (`0.1`). Reachable pre-login (then Logout and BottomNav hidden). |
| `LegalScreen.js` | `Terms` & `Privacy` | Static legal text mirroring `PRIVACY_POLICY.md`. |

---

## 4. Web admin console (`web/`) — page-wise

Every route except `/login` requires the `Admin` role (`ProtectedRoute` → login redirect, or an "Admin access required" notice for authed non-admins).

### 4.1 Routing (`src/App.jsx`)

| Path | Page | Path | Page |
|---|---|---|---|
| `/login` | Login *(public)* | `/leaves` | Leaves |
| `/` | Dashboard | `/overtime` | Overtime |
| `/users` | Users | `/compoff` | CompOff |
| `/attendance` | TeamAttendance | `/expenses` | Expenses |
| `/trail` | TeamTrail | `/sites` | Sites |
| `/holidays` | Holidays | `/chat` | Chat |

`/reports` (Reports.jsx) is **fully commented out** — import, route, and nav entry — so it's dead code; only its `/reports/upcoming` sibling endpoint is used, by the Dashboard. Unknown paths redirect to `/`.

### 4.2 Chrome & shared code

- **`Layout.jsx`** — brand-gradient sidebar with 11 nav entries, collapsible (persisted in `localStorage`), user card with sign-out; mobile gets a top bar + horizontal nav strip.
- **`ui.jsx`** — dependency-free primitives: Card, Button (5 variants), Input/Select/Field, Badge, StatCard, Modal (Escape-to-close, pinned header/footer), Spinner/Loading/EmptyState/ErrorNote/PageHeader. `icons.jsx` has 30 hand-rolled SVG icons — no icon library.
- **`lib/api.js`** — resolves the API base in three tiers (non-localhost `VITE_API_URL` → dev `/api` via Vite proxy → `hostname:4000/api`), attaches the bearer token, and on **401 clears the session and redirects to `/login`**. `fileUrl()` builds `/uploads` URLs.
- **`lib/auth.jsx`** — auth context in `localStorage` (`sess_admin_auth`), expiry-checked on load; localStorage write is synchronous (fixes a race where the first Dashboard fetch ran token-less).
- **`lib/format.js`** — all IST formatters (`fmtTime`, `fmtDate`, `fmtDateTime`, `fmtHours`, `todayIST`, `monthIST`).

### 4.3 Pages

#### `Login.jsx`
Username/password admin sign-in (split-screen brand panel + form). Client-side re-check that the account has the `Admin` role; non-admins are told to use the mobile app. **API:** `POST /auth/login`.

#### `Dashboard.jsx`
One day's attendance overview (defaults to today IST, date scrubber capped at today). Celebrations strip (upcoming birthdays/anniversaries, deep-links into Chat with a canned wish); stat cards Present / Late / Absent / Total; holiday callout (Absent tile becomes "Off (holiday)"); "Currently punched in" pills; present table sorted late-first; absent roster.
**API:** `GET /reports/upcoming?days=7`, `GET /attendance/admin/day?date=`.

#### `Users.jsx`
Employee account management (create, edit, activate/deactivate — no delete). Search; table with role/active badges; Create and Edit modals sharing a three-section profile form — **Employment** (auto `SESS-nnn` ID, DOJ, designation, department, employment type, reporting manager), **Personal** (DOB, blood group, emergency contact, email, address), **Statutory & Bank** (ESI, EPF, PAN, salary CTC, bank details). Blank password on edit = keep current.
**API:** `GET /users`, `GET /users/roles`, `POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`.

#### `TeamAttendance.jsx` — flagship page (three tabs)
- **Month Summary** — per-user roll-up (Present/Leave/Absent/Late/Required/Worked/OT), drill-down to a per-day grid, CSV export; worked hours amber when under required.
- **Day View** — stat cards; punch sessions grouped by user with times, addresses, site + late badges, clickable punch-photo thumbnails; admin session create/edit/delete ("Add manual entry", absentee `+` chips); the session editor is IST-aware and treats blank punch-out as still-open.
- **Corrections** — employee missed-punch requests with approve (applies the fix server-side) / reject (with note).
**API:** the full `GET/POST/PATCH/DELETE /attendance/admin/*` surface (day, month, day-sessions, session, corrections).

#### `TeamTrail.jsx`
One employee's GPS trail for one day on a Leaflet/OpenStreetMap map: polyline with Start/Latest markers, point popups (time, address, ±accuracy), numbered point list, CSV export with Google Maps links. Empty state explains tracking only runs between punch-in and punch-out.
**API:** `GET /users`, `GET /location/user/:id?date=`.

#### `Holidays.jsx`
Holiday calendar per year (year picker, past/upcoming status, delete). **Add** modal (date + name) and **Import** modal: parses `.xlsx/.xls/.csv` in the browser (lazy-loaded `xlsx`), loose header matching, previews ready/skipped rows before sending clean data. Holidays render in UTC (they're date-only values) — deliberate, so the day never shifts.
**API:** `GET /holidays?year=`, `POST /holidays`, `POST /holidays/import`, `DELETE /holidays/:id`.

#### `Leaves.jsx` — three tabs
**Requests** (approve, or reject with an optional note), **My Leave** (the admin's own balances, apply, cancel — same self-service endpoints as mobile), **Policy** (per-type annual quotas, 0.5 steps).
**API:** `GET/PATCH /leaves/requests…`, `GET/PUT /leaves/policy`, `GET /leaves/my`, `POST /leaves/requests`, `DELETE /leaves/requests/:id`.

#### `Overtime.jsx`
OT queue with month + status filters and stat cards; rows show time window, hours, reason, and "added by admin" for grants. Approve/reject/delete; **Add OT modal** grants pre-approved OT to one or many employees (select-all; overnight windows roll to next day; shows skipped employees).
**API:** `GET /ot/requests`, `PATCH /ot/requests/:id/decision`, `POST /ot/grant`, `DELETE /ot/admin/:id`, `GET /users`.

#### `CompOff.jsx`
Comp-off credit review with the three-state **punch verdict cell** (not punched / short of 09:30–18:30 / full day); approving a weak-evidence row asks for confirmation; approved credits can be **revoked**.
**API:** `GET /compoff/requests`, `PATCH /compoff/requests/:id/decision`, `PATCH /compoff/admin/:id/revoke`.

#### `Expenses.jsx`
Claim review only (admins never create claims). Filters: month or day-range (range disables month), employee, status tabs; a second status-less fetch keeps the stat tiles whole-queue. Bill cells render image thumbnails or PDF chips linking to the file. Approve acts directly from the row; reject asks for an optional reason.
**API:** `GET /users`, `GET /expenses/requests`, `PATCH /expenses/requests/:id/decision`.

#### `Sites.jsx`
Manage the punch geofences. Table with map links, radius, active toggle; **"Geofence OFF" warning when no active sites**. The editor sets location three ways: debounced search geocoding (via backend proxy), pasting `"lat, lng"`, or clicking the live Leaflet preview (draws the radius circle). Radius clamped 20–5000 m to match the backend.
**API:** `GET /sites?all=1`, `POST /sites`, `PATCH|DELETE /sites/:id`, `GET /geo/search?q=`.

#### `Chat.jsx`
Same chat as mobile, two-pane: polling (4 s thread / 15 s list), incremental `?after=` merges, smart scroll + jump-to-latest, group @mentions with amber highlighting, image/video upload (25 MB) with caption, read receipts (DMs), unread badges, new-group modal, and `?to=&wish=` deep links from the Dashboard celebrations strip.
**API:** `GET /chat/conversations`, `GET /chat/thread/:userId`, `GET /chat/group-thread/:groupId`, `POST /chat/send`, `POST /chat/upload`, `POST /chat/groups`.

#### `Reports.jsx` — *not routed (commented out)*
Monthly birthdays/anniversaries + headcount breakdowns by department and employment type. Would use `GET /reports/celebrations?month=`, `GET /reports/headcount`.

---

## 5. Backend (`backend/`)

### 5.1 Server & auth

- **`server.js`** — Express 5 on `0.0.0.0:4000` (env `PORT`); open CORS; JSON body limit 10 MB; `trust proxy` (for rate limiting behind Caddy); unauthenticated static `/uploads`; `GET /api/health`.
- **`middleware/auth.js`** — `requireAuth` verifies the HS256 JWT (`JWT_SECRET`) and rejects tokens carrying a `type` claim (so refresh/pin-reset tokens can't be used as access tokens); `requireRole('Admin')` does the role check. No token revocation — deactivating a user doesn't kill an outstanding 90-day token (only `/api/me` re-checks `isActive`).
- **`lib/`** — `prisma.js` (client singleton); `mailer.js` (nodemailer email OTP; fails closed in production if SMTP is unconfigured, prints the code to console in dev); `leaveWorked.js` (credits back approved-leave days the employee actually punched on — computed on read, self-correcting); `whatsapp.js` (**dead code** — the retired WhatsApp OTP path; `WHATSAPP_OTP_SETUP.md` documents it and is stale).

### 5.2 Endpoints by router

Auth legend: **Public** (rate-limited), **Auth** (any signed-in user), **Admin**.

**`/api/auth`** — all Public, 40 req/15 min/IP:
`POST /login` (password, 1-day token) · `POST /check-phone` (email lookup step) · `POST /verify-pin` (email + PIN → 90-day token; 5 wrong PINs = 10-min lock) · `POST /request-otp` (emails 6-digit code; 60 s cooldown, 8/day, race-safe via advisory lock) · `POST /verify-otp` (5 attempts, single-use → 10-min pin-reset token) · `POST /set-pin` (reset token → new PIN → 90-day token).

**`/api/me`** — Auth: `GET /` (identity + isActive check) · `GET /profile` (own profile, no salary/bank) · `PATCH /profile` (only address, emergency contact, blood group, DOB).

**`/api/users`** — Admin (whole router): `GET /roles` · `GET /` · `POST /` (auto SESS-nnn id) · `PATCH /:id` · `PATCH /:id/status` (can't deactivate yourself).

**`/api/attendance`** — Auth: `GET /today` · `POST /punch-in` (geofence-gated, flags `isLate`) · `POST /punch-out` · `GET /my` · `GET /my-month` · `GET /my-day` · `POST /corrections` · `GET /corrections/my` · `DELETE /corrections/:id`.
Admin: `GET /admin/day` · `GET /admin/month` · `GET /admin/day-sessions` · `POST /admin/session` (bypasses geofence) · `PATCH|DELETE /admin/session/:id` · `GET /admin/corrections` · `PATCH /admin/corrections/:id` (approval applies the fix).

**`/api/location`** — Auth: `POST /log` (≤100 points; only points inside a punch window are kept) · `GET /my?date=`. Admin: `GET /user/:id?date=`.

**`/api/holidays`** — Auth reads (`GET /?year=`, `GET /upcoming`); Admin writes (`POST /`, `POST /import`, `DELETE /:id`). Upserts on the unique date.

**`/api/leaves`** — Auth: `GET /types` · `GET /policy` · `GET /balance` · `GET /my` · `POST /requests` (working-days computed excluding Sundays/holidays; overlap + balance checks) · `DELETE /requests/:id`. Admin: `PUT /policy` (CO excluded) · `GET /requests` · `PATCH /requests/:id/decision` (re-checks balance on approve).

**`/api/ot`** — Auth: `GET /my` · `POST /requests` (today or future dates only, 12 h/day cap, no overlaps, overnight rolls to next day) · `DELETE /requests/:id`. Admin: `GET /requests` · `PATCH /requests/:id/decision` · `POST /grant` (bulk pre-approved, `source:'admin'`) · `DELETE /admin/:id`.

**`/api/compoff`** — Auth: `GET /my` · `POST /requests` (an already-worked Sunday/holiday — today or earlier — with a punch record) · `DELETE /requests/:id`. Admin: `GET /requests` (with punch evidence) · `PATCH /requests/:id/decision` · `PATCH /admin/:id/revoke`.

**`/api/sites`** — Auth: `GET /` (active; `all=1` for admins). Admin: `POST /` · `PATCH /:id` · `DELETE /:id` (radius clamped 20–5000 m).

**`/api/geo`** — Admin: `GET /search?q=` (Nominatim proxy with 10-min cache, India-scoped — admin-gated to protect the fair-use quota).

**`/api/reports`** — Auth: `GET /upcoming` (celebrations widget — registered before the admin gate on purpose). Admin: `GET /celebrations?month=` · `GET /headcount`.

**`/api/chat`** — all Auth; authorization is per-resource (group membership), not role: `POST /upload` (image/video, 25 MB) · `GET /conversations` · `POST /groups` · `GET /unread-count` · `GET /thread/:userId` · `GET /group-thread/:groupId` (403 unless member) · `POST /send`.

**`/api/notes`** — Auth: `POST /upload` (photos, 10 MB) · `GET /` · `GET /unread-count` · `PATCH /read` · `POST /` (self note) · `PATCH|DELETE /:id` (own self-notes only). Admin: `POST /send` (notice to many) · `GET /sent` · `DELETE /sent/:id` (own notices only).

**`/api/expenses`** — Auth: `GET /types` · `GET /my` · `POST /upload` (≤5 files, 5 MB each, JPG/PNG/WEBP/HEIC/PDF; the stored extension is allowlisted — taken from the declared mimetype, falling back to the filename) · `POST /` · `DELETE /:id`. Admin: `GET /requests` · `PATCH /requests/:id/decision`.

### 5.3 Database models (`prisma/schema.prisma` — 18 models, PostgreSQL)

| Model | Purpose |
|---|---|
| `User` | Employee + full HRMS record: login (username/password/PIN/email), employment (designation, department, type, DOJ, reporting-manager self-relation), personal, statutory & bank (admin-only), exit fields, `isActive`, `roleId` |
| `Role` | Role lookup (9 standard names; only `Admin` matters for authorization) |
| `AttendanceSession` | One punch-in→out pair: times, in/out GPS + photos + addresses, `workingHours`, `isLate`, `siteName` |
| `AttendanceCorrection` | Employee-raised missed-punch fix awaiting review |
| `OtpCode` | Login OTP store (bcrypt-hashed; the `phone` column now holds the **email**) |
| `Site` | Punch geofence: lat/lng, `radiusM` (default 100), `isActive` |
| `LeaveType` / `LeavePolicy` / `LeaveRequest` | Categories (CL/SL/PL/CO) · annual quotas per type/year · applications with review trail |
| `CompOffRequest` | Credit for a worked week-off/holiday (statuses incl. `revoked`) |
| `OtRequest` | Overtime entry; `source` = employee \| admin (admin rows are pre-approved) |
| `ExpenseRequest` | Claim: type, details, `billPath` + `extraBills[]` (up to 5), review trail |
| `ChatMessage` / `ChatGroup` / `ChatGroupMember` | DM or group post (exactly one of `receiverId`/`groupId`, enforced in route layer) · group · membership with per-member `lastReadId` cursor |
| `Holiday` | Company holiday (unique date, drives import upsert) |
| `LocationLog` | GPS breadcrumb captured during a punch session |
| `Note` | `kind` = self (private, editable) \| admin (one-way notice with `readAt`) |

---

## 6. Running the project

```bash
# Backend (from backend/) — needs .env with DATABASE_URL, JWT_SECRET, SMTP_* vars
npx prisma migrate deploy
node server.js            # http://localhost:4000/api/health
```

```bash
# Admin web (from web/) — Vite proxies /api and /uploads to :4000
npm run dev               # http://localhost:5173
```

```bash
# Mobile (from mobile/) — device must be able to reach the API_URL LAN address
npx expo start
```

Production deployment (VPS, Caddy, PM2, Postgres, backups) is fully documented in [web/DEPLOYMENT.md](web/DEPLOYMENT.md).

---

## 7. Known gaps & flags (as of this writing)

**Placeholders / dead code**
- `TaskListScreen` (mobile) and the Dashboard "Today Tasks" card are placeholders — no task module exists yet.
- Web `Reports.jsx` is complete but unrouted (commented out in `App.jsx` and `Layout.jsx`).
- Mobile `HolidayWidget` / `CelebrationsWidget` are commented out in `ProfileMenuScreen`.
- `backend/lib/whatsapp.js` + `WHATSAPP_OTP_SETUP.md` describe the retired WhatsApp OTP path (login OTP now goes by email); some user-facing strings still say "WhatsApp code".
- `web/README.md`'s route table is stale (lists 5 of the 12 routes).

**Behavior quirks worth knowing**
- `routes/attendance.js` grace band: `ON_TIME_MIN` and `GRACE_END_MIN` are both 09:40, so the documented 09:30–09:40 "grace" level is unreachable on read paths; separately, the stored `isLate` flag is set at 09:30 while read paths recompute at 09:40 — the two can disagree.
- The PIN brute-force lockout lives in an in-process `Map` — it resets on server restart and doesn't share across instances. (The OTP cooldown and daily cap are persisted in the database, so those do survive restarts.)
- `/uploads` (punch selfies, chat media, bills) is served without authentication.
- Geofence **fails open**: no active sites (or a sites-table error) means punching is allowed anywhere.
- Chat's "one of receiverId/groupId" rule is enforced in the route layer only, not by a DB constraint.

**Deployment blockers** (tracked in [web/DEPLOYMENT.md](web/DEPLOYMENT.md) §6 and `SESS_HR_Security_and_Pending_Issues.docx`)
- `mobile/lib/api.js` points at a hardcoded LAN IP over plain HTTP — must be repointed at the production domain before building the APK (per team convention, this line is changed only at deploy time).
- `mobile/app.json` still has placeholder `name`/`slug` (`mobile`) and **no** `android.package` / `ios.bundleIdentifier` — blocks a real store build.
- Fresh `JWT_SECRET` and a changed seeded-admin password are required before go-live.
