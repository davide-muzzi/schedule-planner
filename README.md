# Schedule Planner

A personal work-schedule planner: a weekly, hour-by-hour timeline for
blocking out planned shifts, vacation, appointments and more — plus running
balance tracking against a weekly worktime goal.

Inspired by Odoo's "Anwesenheiten" (Attendance) module, but repurposed for
**planning ahead** rather than logging actual attendance. There's no
separate "break" entry — a gap between two blocks on the same day *is* the
break, visually.

This is a single-user, no-login personal tool, not a multi-tenant product.

## Features

- **Planner** — a Monday–Sunday timeline view (configurable visible days
  and hour range) with drag-to-create, drag-to-resize/move, copy/paste a
  day's entries, and per-day/per-week goal-diff indicators.
- **Overview** — year-to-date stats: hours per week, average by weekday,
  balance trend, a breakdown of time by entry type, and a GitHub-style
  tracking-streak grid.
- **Weather** — a small current-conditions + 7-day forecast widget (via
  [Open-Meteo](https://open-meteo.com/), no API key required), using the
  browser's geolocation when available.
- **Settings** — weekly worktime goal, vacation allotment, visible days,
  timeline zoom, entry-type colors, theme, and full data export/import.
- Responsive down to phone-landscape width, with a further set of
  mobile-specific layouts (collapsible nav drawer, card carousels,
  scrollable charts) below that.

## Tech stack

- **Frontend**: Vue 3 (`<script setup>`, plain JavaScript — no TypeScript),
  Vue Router, Pinia, Axios, Vite. Icons from `@lucide/vue`.
- **Backend**: ASP.NET Core (.NET 10) + Entity Framework Core + SQLite.
- No authentication — every record implicitly belongs to "the user".

## Project structure

```
backend/
  SchedulePlanner/          # ASP.NET Core API (controllers, models, EF Core migrations)
  SchedulePlanner.Tests/    # xUnit test suite
frontend/
  src/
    views/                  # Planner, Overview, Weather, Settings
    components/             # DayTable, WeekSummary, charts, modals, etc.
    stores/                 # Pinia store (scheduleStore.js)
    composables/            # shared reactive state (app shell chrome, weather, etc.)
deploy/                     # Raspberry Pi deployment guide + systemd service template
```

## Getting started

### Prerequisites

- [.NET SDK 10](https://dotnet.microsoft.com/download)
- [Node.js](https://nodejs.org/) `^22.18.0` or `>=24.12.0`

### Backend

```bash
cd backend/SchedulePlanner
dotnet run
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

Runs at `http://localhost:5173` by default. Create a `.env` file in
`frontend/` pointing at the backend if it isn't already there:

```
VITE_API_URL=http://localhost:5126
```

With both running, open `http://localhost:5173` in your browser.

## Running tests

```bash
cd backend/SchedulePlanner.Tests
dotnet test
```

## Building for production

The backend serves the built frontend as static files from a single
process/port, so a production build means building the frontend into the
backend's `wwwroot`, then publishing the backend:

```bash
cd frontend
npm run build

cd ../backend/SchedulePlanner
rm -rf wwwroot/*
cp -r ../../frontend/dist/* wwwroot/

dotnet publish SchedulePlanner.csproj -c Release -o <output-dir>
```

For a full step-by-step guide to deploying this to a Raspberry Pi
(including a systemd service template), see [`deploy/README.md`](deploy/README.md).
