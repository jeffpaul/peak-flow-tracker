# Peak Flow Tracker

[![MIT License](https://img.shields.io/github/license/jeffpaul/peak-flow-tracker.svg)](https://github.com/jeffpaul/peak-flow-tracker/blob/main/LICENSE)
[![Ingest Reading](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/ingest-reading.yml/badge.svg)](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/ingest-reading.yml) [![Validate Data](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/validate-data.yml/badge.svg)](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/validate-data.yml) [![pages-build-deployment](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/pages/pages-build-deployment/badge.svg)](https://github.com/jeffpaul/peak-flow-tracker/actions/workflows/pages/pages-build-deployment)

> Log peak flow readings via a GitHub Issue, view trends on a static dashboard. No backend, no accounts.

A GitHub-repo-based tool for logging peak flow meter readings from a phone and viewing trends over time. No backend, no accounts, no tokens on the phone — readings come in as a GitHub Issue, a GitHub Action files them into `data/readings.json`, and a static dashboard on GitHub Pages reads that file directly.

This repo is public but **de-identified**: no name, birthdate, or other identifying detail is stored anywhere (code, config, commit messages, or the repo description). Dates/times of readings are visible publicly — a reasonable tradeoff for keeping this simple and free to run.

## How it works

1. Fill in a reading on `log.html` — a small static form with native date/time pickers — or open a new issue directly using the **Log a reading** template (`.github/ISSUE_TEMPLATE/reading.yml`).
2. `log.html` doesn't submit anything itself; it redirects to GitHub's own "new issue" page with every field pre-filled via query parameters, so you just review and tap **Submit new issue** there. No token or credential ever touches the page.
3. The `Ingest Reading` workflow checks that you're an authorized submitter, parses the form, computes the best-of-3 reading and its zone, appends it to `data/readings.json`, comments on the issue with the result, and closes it.
4. The dashboard (`index.html`, served by GitHub Pages) reads `data/readings.json` and `data/config.json` to render the chart, stats, and history table.

## One-time setup

### Enable GitHub Pages

**Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`.

### Create the `reading` label

`reading.yml` declares `labels: ["reading"]`, but GitHub only auto-applies a label from an issue form if that label **already exists** in the repo — it won't create it. `Ingest Reading` only runs on issues with that label, so until it exists, every submission gets silently skipped (not failed — just never runs). Create it once:

```
gh label create reading --repo <owner>/<repo> --description "Peak flow reading submission" --color "2563eb"
```

Or via the web UI: **Issues → Labels → New label**, name it exactly `reading`.

That's it for setup beyond Pages and this label — there are no repo Variables or Secrets to configure. Everything the app needs lives in `data/config.json`, which both the dashboard and the `Ingest Reading` workflow read directly — one source of truth, no duplication:

```json
{
  "schemaVersion": 1,
  "zones": { "green": { "min": 240, "max": 300 }, "yellow": { "min": 150, "max": 240 }, "red": { "max": 150 } },
  "allowedUsers": ["jeffpaul"]
}
```

- **Zone thresholds** (`zones`) — if a doctor visit changes them, hand-edit `data/config.json` and commit; it takes effect for both the dashboard and newly-logged readings right away. Historical entries already have their zone baked in at ingest time and won't be reclassified retroactively.
- **Who can submit readings** (`allowedUsers`) — a plain array of GitHub usernames, matched case-insensitively. Add or remove names here and commit; `validate-data.yml` will fail the push if this ends up empty or malformed, since that would silently lock everyone out of `Ingest Reading`.
- **Schema version** (`schemaVersion`) — a plain marker for `data/readings.json`'s entry shape, currently `1`. Nothing reads this yet; it exists so that if the schema needs to change after real data is flowing, there's a version to bump and branch on instead of having to infer the shape from which fields happen to be present on older entries.

Readings are also sanity-bounded to **60–800 L/min** — `log.html` enforces this natively, `Ingest Reading` rejects (comments + closes without appending) any issue with a reading outside that range rather than silently dropping or clamping it, and `validate-data.yml` re-checks it on every push as a backstop against a bad hand-edit.

## Logging a reading on your phone

- **Fastest:** bookmark `https://<owner>.github.io/<repo>/log.html` to your homescreen. It gives you a real native date/time picker instead of typing `YYYY-MM-DD` and `HH:MM` by hand, then hands off to GitHub to finish submitting.
- **GitHub mobile app:** Repo → Issues → "+" → "Log a reading" template.
- **Also fast:** bookmark `https://github.com/<owner>/<repo>/issues/new?template=reading.yml` directly — it jumps straight to the form (no date/time picker, but zero extra taps).

Only usernames listed in `allowedUsers` (in `data/config.json`) can submit; anyone else gets a comment and the issue is closed automatically — this is unchanged regardless of which entry point you use, since `log.html` is just a nicer form in front of the same issue template.

`log.html` hardcodes the repo owner/name (`jeffpaul/peak-flow-tracker`) at the top of `assets/log.js` to build the redirect URL — update that constant if the repo is ever renamed or forked.

## Resetting to real data

The seed data in `data/readings.json` is there so you can see the dashboard working before you've logged anything real. There's intentionally no automated "reset" workflow for this — when you're ready to stop looking at sample data, hand-edit `data/readings.json` back to `[]` and commit, so it doesn't happen by accident once real data is in there.

## Repo structure

```
peak-flow-tracker/
├── index.html                      # Dashboard: chart + history table (read-only)
├── log.html                         # Fast-entry form with native date/time pickers → redirects to GitHub
├── assets/
│   ├── app.js
│   ├── log.js
│   └── style.css
├── data/
│   ├── readings.json                # array of reading entries
│   └── config.json                  # zone thresholds + allowed submitters — single source of truth, hand-edited
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── reading.yml              # structured issue form for logging a reading
│   └── workflows/
│       ├── ingest-reading.yml       # checks allowed user → parses reading → appends to readings.json
│       └── validate-data.yml        # lints readings.json/config.json shape on push
└── LICENSE                          # MIT
```
