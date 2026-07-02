# Peak Flow Tracker

A GitHub-repo-based tool for logging peak flow meter readings from a phone and viewing trends over time. No backend, no accounts, no tokens on the phone — readings come in as a GitHub Issue, a GitHub Action files them into `data/readings.json`, and a static dashboard on GitHub Pages reads that file directly.

This repo is public but **de-identified**: no name, birthdate, or other identifying detail is stored anywhere (code, config, commit messages, or the repo description). Dates/times of readings are visible publicly — a reasonable tradeoff for keeping this simple and free to run.

## How it works

1. Open a new issue using the **Log a reading** template (`.github/ISSUE_TEMPLATE/reading.yml`) from the GitHub app, or the web.
2. The `Ingest Reading` workflow checks that you're an authorized submitter, parses the form, computes the best-of-3 reading and its zone, appends it to `data/readings.json`, comments on the issue with the result, and closes it.
3. The dashboard (`index.html`, served by GitHub Pages) reads `data/readings.json` and `data/config.json` to render the chart, stats, and history table.

## One-time setup

### Enable GitHub Pages

**Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.

That's it — there are no repo Variables or Secrets to configure. Everything the app needs lives in the repo itself:

- **Zone thresholds** live only in `data/config.json`, and both the dashboard and the `Ingest Reading` workflow read that same file — one source of truth, no duplication. If a doctor visit changes the thresholds, hand-edit `data/config.json` (or ask Claude Code to do it) and commit; it takes effect for both the dashboard and newly-logged readings right away. Historical entries already have their zone baked in at ingest time and won't be reclassified retroactively.
- **Who can submit readings** is a hardcoded array (`ALLOWED_USERS`) near the top of the "Check authorization" step in `.github/workflows/ingest-reading.yml`. To add or change authorized submitters, edit that array directly (a commit/PR) rather than a Settings page — a deliberate tradeoff for keeping this to zero repo configuration.

## Logging a reading on your phone

- **GitHub mobile app:** Repo → Issues → "+" → "Log a reading" template.
- **Faster:** bookmark `https://github.com/<owner>/<repo>/issues/new?template=reading.yml` directly to your homescreen — it jumps straight to the form.

Only usernames listed in `ALLOWED_USERS` (in `ingest-reading.yml`) can submit; anyone else gets a comment and the issue is closed automatically.

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
│   └── config.json                  # zone thresholds — single source of truth for dashboard + ingest workflow, hand-edited
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── reading.yml              # structured issue form for logging a reading
│   └── workflows/
│       ├── ingest-reading.yml       # checks allowed user → parses reading → appends to readings.json
│       └── validate-data.yml        # lints readings.json/config.json shape on push
└── peak-flow-tracker-spec.md        # original build spec
```

See `peak-flow-tracker-spec.md` for the full data model and zone logic.
