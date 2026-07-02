# Peak Flow Tracker

A GitHub-repo-based tool for logging peak flow meter readings from a phone and viewing trends over time. No backend, no accounts, no tokens on the phone — readings come in as a GitHub Issue, a GitHub Action files them into `data/readings.json`, and a static dashboard on GitHub Pages reads that file directly.

This repo is public but **de-identified**: no name, birthdate, or other identifying detail is stored anywhere (code, config, commit messages, or the repo description). Dates/times of readings are visible publicly — a reasonable tradeoff for keeping this simple and free to run.

## How it works

1. Open a new issue using the **Log a reading** template (`.github/ISSUE_TEMPLATE/reading.yml`) from the GitHub app, or the web.
2. The `Ingest Reading` workflow checks that you're an authorized submitter, parses the form, computes the best-of-3 reading and its zone, appends it to `data/readings.json`, comments on the issue with the result, and closes it.
3. The dashboard (`index.html`, served by GitHub Pages) reads `data/readings.json` and `data/config.json` to render the chart, stats, and history table.

## One-time setup

### 1. Repo Variables

Go to **Settings → Secrets and variables → Actions → Variables tab** and set:

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_USERS` | `jeffpaul` | Comma-separated GitHub usernames allowed to submit readings (case-insensitive). |
| `GREEN_MIN` | `240` | Lower bound of green zone (L/min) |
| `GREEN_MAX` | `300` | Upper bound of green zone (L/min) |
| `YELLOW_MIN` | `150` | Lower bound of yellow zone |
| `YELLOW_MAX` | `240` | Upper bound of yellow zone |
| `RED_MAX` | `150` | Anything below this is red zone |

These are just plain L/min cutoffs — no code changes needed if a doctor gives you different numbers later, just update the variables and re-run `Sync Config` (below).

### 2. Enable GitHub Pages

**Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.

### 3. Run "Sync Config" once

**Actions tab → Sync Config → Run workflow.** This writes the Variables above into `data/config.json`, which is what the static dashboard actually reads (Pages can't read repo Variables directly).

Re-run this any time you change the threshold Variables.

## Logging a reading on your phone

- **GitHub mobile app:** Repo → Issues → "+" → "Log a reading" template.
- **Faster:** bookmark `https://github.com/<owner>/<repo>/issues/new?template=reading.yml` directly to your homescreen — it jumps straight to the form.

Only usernames listed in `ALLOWED_USERS` can submit; anyone else gets a comment and the issue is closed automatically.

## Resetting to real data

The seed data in `data/readings.json` is there so you can see the dashboard working before you've logged anything real. There's intentionally no automated "reset" workflow for this — ask Claude Code to wipe `data/readings.json` back to `[]` and commit when you're ready to stop looking at sample data, so it doesn't happen by accident once real data is in there.

## Repo structure

```
peak-flow-tracker/
├── index.html                      # Dashboard: chart + history table (read-only)
├── assets/
│   ├── app.js
│   └── style.css
├── data/
│   ├── readings.json                # array of reading entries
│   └── config.json                  # generated from repo Variables — do not hand-edit
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── reading.yml              # structured issue form for logging a reading
│   └── workflows/
│       ├── ingest-reading.yml       # checks allowed user → parses reading → appends to readings.json
│       ├── sync-config.yml          # writes data/config.json from repo Variables (manual trigger)
│       └── validate-data.yml        # lints readings.json/config.json shape on push
└── peak-flow-tracker-spec.md        # original build spec
```

See `peak-flow-tracker-spec.md` for the full data model and zone logic.
