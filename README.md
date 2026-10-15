# Schedule Planner

A personal work-schedule planner: a weekly, hour-by-hour timeline for
blocking out planned shifts, vacation, appointments and more — plus running
balance tracking against a weekly worktime goal.

Inspired by Odoo's "Anwesenheiten" (Attendance) module, but repurposed for
**planning ahead** rather than logging actual attendance. There's no
separate "break" entry — a gap between two blocks on the same day *is* the
break, visually.

This is a single-user personal tool, not a multi-tenant product — it does
sit behind a login now, but there's no self-service registration; the one
account is bootstrapped from env vars on first run (see **Getting started**
below).

## Features

- **Planner** — a Monday–Sunday timeline view (configurable visible days
  and hour range) with drag-to-create, drag-to-resize/move, right-click-drag
  to copy an entry, Alt+click split / Alt+right-click merge, middle-click
  delete, copy/paste a day's entries, and per-day/per-week goal-diff
  indicators. Each day gets a warning icon when it breaks a working-time
  rule (missing breaks, Blockzeit core hours, Betriebszeit Mon–Fri
  06:00–20:00, a 14h daily span, or under 11h rest since the previous
  day), and weekly hours are colored against a 45h maximum. An "Include
  future weeks" toggle controls whether the overall balance counts weeks
  beyond a configurable cutoff.
- **Tasks** — a Backlog/Ready/InProgress/Done Kanban board for one-off
  tasks and multi-subtask Groups, with priorities, tags, colors, due dates
  (with a relative countdown), created/updated/completed timestamps,
  search/sort/filtering (including by date and tag), and an expandable
  detail view (a wider side-by-side layout for Groups, with each subtask
  itself expandable). A task's status follows its Planner links automatically
  — Backlog while unscheduled, Ready/InProgress once linked to an entry,
  depending on whether that entry has started — and its detail view can jump
  straight to whichever linked entry is running now or coming up next.
- **Overview** — year-to-date stats: hours per week, average by weekday,
  balance trend, a breakdown of time by entry type, longest tracked day, a
  GitHub-style tracking-streak grid, and Tasks stats (status/priority
  breakdown, time by priority, overdue count).
- **Weather** — a small current-conditions + 7-day forecast widget (via
  [Open-Meteo](https://open-meteo.com/), no API key required), using the
  browser's geolocation when available.
- **Settings** — weekly worktime goal, vacation allotment, visible days,
  timeline zoom, entry-type colors, theme, reduced motion, sidebar width,
  and full data export/import.
- Responsive down to phone-landscape width, with a further set of
  mobile-specific layouts (collapsible nav drawer, card carousels,
  scrollable charts) below that.

## Tech stack

- **Frontend**: Vue 3 (`<script setup>`, plain JavaScript — no TypeScript),
  Vue Router, Pinia, Axios, Vite. Icons from `@lucide/vue`.
- **Backend**: ASP.NET Core (.NET 10) + Entity Framework Core + SQLite.
- **Auth**: ASP.NET Core Identity, cookie-based. No public registration —
  the single account is created from `ADMIN_USERNAME`/`ADMIN_PASSWORD` the
  first time the app starts with an empty user table, and never again after
  that.

## Project structure

```
backend/
  SchedulePlanner/          # ASP.NET Core API (controllers, models, EF Core migrations)
  SchedulePlanner.Tests/    # xUnit test suite
frontend/
  src/
    views/                  # Planner, Tasks, Overview, Weather, Settings
    components/             # DayTable, WeekSummary, TaskCard, charts, modals, etc.
    stores/                 # Pinia stores (scheduleStore, tasksStore, tagsStore)
    composables/            # shared reactive state (app shell chrome, weather, etc.)
deploy/                     # Raspberry Pi deployment guide + systemd service template
```

## Getting started

### Prerequisites

- [.NET SDK 10](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) `^22.18.0` or `>=24.12.0`

This section is for local development (hot reload, two processes). To run
it permanently on a server, see **Self-hosting** below.

```bash
git clone https://github.com/davide-muzzi/schedule-planner.git
cd schedule-planner
```

### Backend

Set `ADMIN_USERNAME`/`ADMIN_PASSWORD` (as env vars, or in a
`backend/SchedulePlanner/appsettings.Development.json` you create yourself —
it's gitignored) before starting the backend for the first time — without
them the user table stays empty and nobody can log in. The password has to
meet ASP.NET Core Identity's defaults (6+ characters, with an uppercase
letter, a lowercase letter, a digit and a symbol), otherwise seeding fails
and the error shows up in the backend log:

```bash
cd backend/SchedulePlanner
ADMIN_USERNAME=you ADMIN_PASSWORD=change-me dotnet run
```

Runs at `http://localhost:5126` by default (see `Properties/launchSettings.json`).
The SQLite database and its schema migrations are applied automatically on
startup — no separate migration step needed.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at `http://localhost:5173` by default. A fresh clone has no
`frontend/.env` (it's gitignored), so create one pointing at the backend:

```
VITE_API_URL=http://localhost:5126
```

With both running, open `http://localhost:5173` in your browser.

## Running tests

```bash
cd backend/SchedulePlanner.Tests
dotnet test
```

## Self-hosting

In production the backend also serves the built frontend, so the whole app
is a single process on a single port. The steps below assume a Linux
server with systemd (a VPS, a home server, a Raspberry Pi…). For a
Raspberry Pi reachable over Tailscale specifically, see
[`deploy/README.md`](deploy/README.md), which covers the same steps with
the Tailscale bits filled in.

### 1. Install the prerequisites

On the server, install the [.NET SDK 10](https://dotnet.microsoft.com/download)
and [Node.js](https://nodejs.org/) `^22.18.0` or `>=24.12.0`, plus `git`.
If your distro doesn't package .NET 10, Microsoft's install script works
for any user without root:

```bash
curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 10.0
echo 'export DOTNET_ROOT=$HOME/.dotnet' >> ~/.bashrc
echo 'export PATH=$PATH:$HOME/.dotnet' >> ~/.bashrc
source ~/.bashrc
```

### 2. Clone the repo

```bash
git clone https://github.com/davide-muzzi/schedule-planner.git ~/schedule-planner
cd ~/schedule-planner
```

### 3. Build and publish

```bash
cd frontend
npm ci
npm run build
rm -rf ../backend/SchedulePlanner/wwwroot/*
cp -r dist/* ../backend/SchedulePlanner/wwwroot/

cd ../backend/SchedulePlanner
# Target the .csproj explicitly - the folder also contains a .sln, and
# publishing that would include the test project too.
dotnet publish SchedulePlanner.csproj -c Release -o ~/schedule-planner-publish
```

Don't create a `frontend/.env` on the server: production builds use
`frontend/.env.production`, which leaves `VITE_API_URL` empty so the
frontend calls the API on the same origin it was served from.

### 4. Configure it

Everything is configured through environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | First start only | Creates the one login account when the user table is empty. Ignored once an account exists — there's no registration page, so this is the only way in. Password rules as described under **Getting started**. |
| `ASPNETCORE_URLS` | Yes | Address(es) to listen on, e.g. `http://127.0.0.1:5000` behind a reverse proxy. Separate multiple addresses with `;`. |
| `ASPNETCORE_ENVIRONMENT` | Recommended | Set to `Production`. |
| `ConnectionStrings__DefaultConnection` | No | SQLite connection string. Defaults to `Data Source=schedule.db`, i.e. a file in the process's working directory. |

The database file and its schema are created automatically on first start,
and new migrations are applied on every start — no separate migration step.

### 5. Run it as a service

[`deploy/schedule-planner.service`](deploy/schedule-planner.service) is a
systemd unit template. Copy it into place, then edit **the copy** (not the
file in the repo, so your password never ends up in git) and replace every
`<PLACEHOLDER>` with your username, listen address and credentials. If
`dotnet` came from your package manager rather than the install script,
also change `ExecStart` to `/usr/bin/dotnet …`.

```bash
sudo cp deploy/schedule-planner.service /etc/systemd/system/
sudo nano /etc/systemd/system/schedule-planner.service
sudo systemctl daemon-reload
sudo systemctl enable --now schedule-planner
```

Check it's running and that the account was seeded:

```bash
sudo systemctl status schedule-planner
journalctl -u schedule-planner -f     # look for "Seeded initial user"
```

Once you've logged in successfully you can remove the `ADMIN_PASSWORD` line
from the unit file — it's only read while no account exists.

### 6. Make it reachable

The app speaks plain HTTP only and doesn't terminate TLS itself. Since the
login cookie travels with every request, don't expose it to the internet
without HTTPS in front of it. Either:

- keep it on a private network / VPN (e.g. Tailscale, as in
  [`deploy/README.md`](deploy/README.md)), or
- bind it to `127.0.0.1` and put a reverse proxy with HTTPS in front, e.g.
  [Caddy](https://caddyserver.com/) with a one-line Caddyfile:
  `planner.example.com { reverse_proxy 127.0.0.1:5000 }`.

### Updating

```bash
cd ~/schedule-planner
git pull
# then repeat step 3, and:
sudo systemctl restart schedule-planner
```

### Backups

All data lives in the single SQLite file (`schedule.db` in the service's
working directory, `~/schedule-planner-publish` with the template). Either
copy that file while the service is stopped, or use **Settings → Export
data** in the app for a JSON backup, which **Settings → Import data** can
restore on any instance — this is also the easiest way to move your data
to a new server.

### Good to know

- **Built around one person's job.** The day and week warnings follow
  Swiss labour law (ArG: 45h weekly maximum, break rules, 14h daily span,
  11h rest) plus one specific employer's core hours (Blockzeiten
  09:00–11:30 and 14:00–16:00 on weekdays, Betriebszeit Mon–Fri
  06:00–20:00). These are hardcoded, not settings — if they don't fit your
  situation, change the constants in
  [`frontend/src/utils/constants.js`](frontend/src/utils/constants.js) and
  rebuild.
- **Weather location needs HTTPS.** Browsers only allow geolocation on
  HTTPS (or `localhost`). Over plain HTTP — e.g. a Tailscale IP — the
  Weather view always falls back to the hardcoded default location
  (Rotkreuz, CH), set in
  [`frontend/src/composables/useWeather.js`](frontend/src/composables/useWeather.js).
- **One user per instance.** Self-hosting is meant for a single person, the
  same as the original setup — there's one account and no way to add more.
  Related: login attempts are rate-limited per client IP (5 per minute),
  but the app doesn't read forwarded headers, so behind a reverse proxy or
  Tailscale Funnel every request appears to come from `127.0.0.1`. With one
  user that just means failed attempts from anywhere count toward the same
  limit.
