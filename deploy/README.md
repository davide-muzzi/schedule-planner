# Deploying to the Pi

One-time setup, then a repeatable update sequence. Run everything below directly
on the Pi (over SSH), not on your dev PC - see the main conversation for why.

## One-time setup

1. Install .NET and Node.js on the Pi:
   ```bash
   curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 10.0
   echo 'export DOTNET_ROOT=$HOME/.dotnet' >> ~/.bashrc
   echo 'export PATH=$PATH:$HOME/.dotnet' >> ~/.bashrc
   source ~/.bashrc
   ```
   (Node.js is assumed already installed - `node --version` to check.)
2. Clone the repo: `git clone <repo-url> ~/schedule-planner`
3. Copy `deploy/schedule-planner.service` to `/etc/systemd/system/schedule-planner.service`,
   then edit that copy (the one in `/etc/systemd/system`, not the one in the
   repo) to replace every `<PLACEHOLDER>` with your actual username, the
   Pi's Tailscale IP, and the login credentials you want for the app itself
   (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) - this keeps those real values out of
   the public repo. The app creates that one account from those two values
   the first time it starts with an empty user table, and never again after
   that - there's no registration page, so this is the only way in.
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
# Target the .csproj explicitly - this folder also has a .sln in it, and
# `dotnet publish` with no target defaults to publishing the whole solution
# (including the test project) rather than just the app.
dotnet publish SchedulePlanner.csproj -c Release -o ~/schedule-planner-publish

sudo systemctl restart schedule-planner
```

The first time you run this, the app creates its own database schema on
startup (see the auto-migration change) - no separate migration step needed.

## Moving your existing data over

Once the service is running for the first time (empty database), use the
app's own Export/Import feature rather than copying `schedule.db` directly:

1. On your current machine: Settings → Export data (downloads a JSON backup).
2. On the Pi-hosted app (reachable at `http://<your Pi's Tailscale IP>:5000`
   from a device on your tailnet): Settings → Import data → select that file.

## Checking it's running

```bash
sudo systemctl status schedule-planner
journalctl -u schedule-planner -f   # live logs
```
