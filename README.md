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

These variables drive the `Ingest Reading` workflow's zone classification for new readings (it reads `vars` directly). They're **not** read by the dashboard — GitHub Pages serves static files and can't query repo Variables at runtime, so the dashboard reads the plain thresholds out of `data/config.json` instead.

That means the two are two separate copies of the same numbers, and nothing keeps them in sync automatically. If a doctor visit changes the thresholds:
1. Update the Variables above (affects newly-logged readings going forward).
2. Also hand-edit `data/config.json` to match (affects the dashboard's zone bands/stats going forward) — ask Claude Code to do this and commit if you'd rather not edit JSON directly.

Historical entries in `data/readings.json` already have their zone baked in at ingest time and won't be reclassified retroactively either way.

### 2. Enable GitHub Pages

**Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.

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
│   └── config.json                  # zone thresholds for the dashboard — hand-edited, keep in sync with repo Variables
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── reading.yml              # structured issue form for logging a reading
│   └── workflows/
│       ├── ingest-reading.yml       # checks allowed user → parses reading → appends to readings.json
│       └── validate-data.yml        # lints readings.json/config.json shape on push
└── peak-flow-tracker-spec.md        # original build spec
```

See `peak-flow-tracker-spec.md` for the full data model and zone logic.
