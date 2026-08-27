# Deploying to the Pi

One-time setup, then a repeatable update sequence. Run everything below directly
on the Pi (over SSH), not on your dev PC - see the main conversation for why.

## One-time setup

1. Install the .NET SDK and Node.js on the Pi.
2. Clone the repo: `git clone <repo-url> ~/schedule-planner`
3. Copy `deploy/schedule-planner.service` to `/etc/systemd/system/schedule-planner.service`,
   adjusting `User`, `WorkingDirectory`, `ExecStart`, and the Tailscale IP in
   `ASPNETCORE_URLS` if anything differs from your actual setup.
4. `sudo systemctl daemon-reload`
5. `sudo systemctl enable schedule-planner` (starts automatically on boot)

## Every deploy (including the first one)

Run from `~/schedule-planner`:

```bash
git pull

cd frontend
npm ci
npm run build
rm -rf ../backend/SchedulePlanner/wwwroot/*
cp -r dist/* ../backend/SchedulePlanner/wwwroot/

cd ../backend/SchedulePlanner
dotnet publish -c Release -o ~/schedule-planner-publish

sudo systemctl restart schedule-planner
```

The first time you run this, the app creates its own database schema on
startup (see the auto-migration change) - no separate migration step needed.

## Moving your existing data over

Once the service is running for the first time (empty database), use the
app's own Export/Import feature rather than copying `schedule.db` directly:

1. On your current machine: Settings → Export data (downloads a JSON backup).
2. On the Pi-hosted app (reachable at `http://100.117.171.120:5000` from a
   device on your tailnet): Settings → Import data → select that file.

## Checking it's running

```bash
sudo systemctl status schedule-planner
journalctl -u schedule-planner -f   # live logs
```
