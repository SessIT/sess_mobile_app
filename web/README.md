# SESS Admin Web Console

React + Vite + Tailwind admin panel for the SESS attendance system.

- **Employees** punch in/out from the **mobile app** (unchanged).
- **Admins** (Technical Director / Admin) run everything from this web console:
  user management, team attendance (with punch photos), and location trails.

It talks to the **same backend** as the mobile app — no backend changes required.

## Stack

- React 18 + Vite 5
- Tailwind CSS 3
- React Router 6
- Leaflet + react-leaflet (Team Trail map, free OpenStreetMap tiles)

## Prerequisites

The backend must be running and reachable. From `../backend`:

```bash
npm install
npx prisma generate
npm run dev   # or: node server.js  — serves http://localhost:4000
```

You also need an **admin** user (role `Technical Director / Admin`) with a password,
since this console uses password login (not OTP).

## Configure

The API base URL is read from `VITE_API_URL` in `.env` (already created):

```
VITE_API_URL=http://localhost:4000/api
```

If you open the console from another device on the office LAN, point it at the
server machine's IP, e.g. `http://192.168.68.104:4000/api`.

## Run (development)

```bash
cd web
npm install
npm run dev
```

Then open **http://localhost:5173** and sign in with an admin username/password.

## Build (production)

```bash
npm run build     # outputs to web/dist
npm run preview   # serve the built app locally to verify
```

`web/dist` is a static bundle — host it anywhere (Nginx, Netlify, a static folder
on the backend, etc.). Make sure `VITE_API_URL` points at the deployed backend at
build time.

## Pages

| Route | Page | What it does |
|-------|------|--------------|
| `/login` | Login | Admin password login |
| `/` | Dashboard | Today's present / late / absent, who's currently punched in |
| `/users` | User Management | List, create, activate/deactivate accounts |
| `/attendance` | Team Attendance | Month summary + day view with punch photos & addresses |
| `/trail` | Team Trail | Employee GPS trail for a day, drawn on a map |

## Notes

- Times/dates render in **IST (Asia/Kolkata)** to match the mobile app.
- Non-admin accounts can sign in but see an "Admin access required" screen — the
  backend also enforces this (`requireRole('Technical Director / Admin')`).
