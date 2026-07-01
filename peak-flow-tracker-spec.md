# Peak Flow Tracker — Build Spec for Claude Code

## Goal
A GitHub-repo-based tool to log a child's peak flow meter readings from a phone, and view trends over time (phone primary, computer secondary) via GitHub Pages. No backend server — everything lives in the repo as static files, with entries committed directly from the browser via the GitHub API.

## Architecture
- **GitHub Pages** serves a static, read-only dashboard (charts + history).
- **Data lives in the repo** as a JSON file.
- **Entries come in via a GitHub Issue Form**, not a web form — no token or login step beyond being signed into GitHub (which the phone's GitHub app or browser already handles). Submitting the issue triggers a **GitHub Action** that parses the structured issue body, appends a new entry to `data/readings.json`, commits it, and closes the issue with a confirmation comment showing the computed zone.
- No PAT, no client-side write access, no server. The only "app" the phone needs is the GitHub mobile app (or a homescreen bookmark to the "new issue" URL in a browser).

## Repository configuration — GitHub Actions Variables
Set under **Settings → Secrets and variables → Actions → Variables tab**. These drive both the authorization check and the zone thresholds, so they can be updated without touching code.

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_USERS` | `jeffpaul` | Comma-separated GitHub usernames allowed to submit readings. Case-insensitive match against the issue author. |
| `GREEN_MIN` | `240` | Lower bound of green zone (L/min) |
| `GREEN_MAX` | `300` | Upper bound of green zone (L/min) — typically personal best |
| `YELLOW_MIN` | `150` | Lower bound of yellow zone |
| `YELLOW_MAX` | `240` | Upper bound of yellow zone |
| `RED_MAX` | `150` | Anything below this is red zone |

Defaults above match the thresholds already written into your paper diary (green 240–300, yellow 150–240, red <150) — adjust the variable values directly in Settings if your child's actual numbers differ, no code change needed.

## Repo structure
```
peak-flow-tracker/
├── index.html                      # Dashboard: chart + history table (read-only)
├── assets/
│   ├── app.js
│   └── style.css
├── data/
│   ├── readings.json                # array of reading entries (see schema below)
│   └── config.json                  # generated from repo Variables — do not hand-edit
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── reading.yml              # structured issue form for logging a reading
│   └── workflows/
│       ├── ingest-reading.yml       # checks allowed user → parses reading → appends to readings.json
│       ├── sync-config.yml          # writes data/config.json from repo Variables (manual trigger)
│       ├── reset-data.yml           # wipes data/readings.json to [] (manual trigger, run once real data starts)
│       └── validate-data.yml        # optional: lints readings.json on push
└── README.md
```

## Data model — `data/readings.json`
```json
[
  {
    "id": "2026-07-01T07:15:00Z",
    "date": "2026-07-01",
    "time": "07:15",
    "period": "AM",
    "readings": [280, 275, 290],
    "best": 290,
    "beforeRescue": false,
    "afterRescue": false,
    "afterRescueBest": null,
    "symptoms": {
      "cough": false,
      "wheeze": false,
      "nighttimeAwakening": false,
      "notes": ""
    }
  }
]
```

## `data/config.json` (auto-generated — see `sync-config.yml` below)
```json
{
  "zones": {
    "green": { "min": 240, "max": 300 },
    "yellow": { "min": 150, "max": 240 },
    "red": { "max": 150 }
  }
}
```
This file is written by the `sync-config.yml` workflow, not edited by hand — the source of truth is the repo Variables listed above.
Zones should default to the standard NIH ratios (green ≥80% of personal best, yellow 50–79%, red <50%) but be manually editable in this file, since a doctor may assign specific numbers (as in the paper diary: green 240–300, yellow 150–240, red <150).

## How entries get in — `.github/ISSUE_TEMPLATE/reading.yml`
A GitHub Issue Form with structured fields (renders as a real form, not free text, in both the GitHub app and web):
- Date (defaults blank, user fills in — GitHub issue forms don't support "today" defaults, so put today's date in the template's placeholder text as a reminder)
- Time + AM/PM dropdown
- Reading 1, Reading 2, Reading 3 (number inputs)
- Before-rescue-inhaler? (dropdown: yes/no)
- After-rescue-inhaler? (dropdown: yes/no) + optional "after rescue" readings 1–3
- Symptom checkboxes: cough, wheeze, nighttime awakening
- Free-text notes

The template auto-applies a label like `reading` to every submission so the workflow only fires on this issue type (in case other issues get opened in the repo).

## How entries get processed — `.github/workflows/ingest-reading.yml`
Triggered `on: issues: [opened]`, filtered to the `reading` label:
1. **Authorization check first:** compare `github.event.issue.user.login` (case-insensitive) against the `ALLOWED_USERS` repo variable (comma-separated list). If the author isn't on the list, immediately comment something like "This repo only accepts readings from authorized submitters" and close the issue — skip all further steps. This is the enforcement point, since GitHub itself doesn't offer a native way to restrict who can use a specific issue template on a public repo.
2. Parse the issue body (issue forms produce a predictable Markdown structure — use `actions/github-script` or a small parsing script to pull out each field).
3. Compute `best` as the max of the entered readings (and `afterRescueBest` if after-rescue readings were given).
4. Look up the zone by comparing `best` against the `GREEN_MIN`/`GREEN_MAX`/`YELLOW_MIN`/`YELLOW_MAX`/`RED_MAX` repo variables directly (no need to read `config.json` for this — the workflow has native access to Variables).
5. Append the new entry to `data/readings.json` (checkout repo, edit file, commit with `git-auto-commit-action` or a direct `git commit`/`push` step, using the workflow's built-in `GITHUB_TOKEN` — no PAT needed since this runs as an Action, not from the browser).
6. Comment on the issue with a quick confirmation ("Logged: 285 L/min — Green zone ✅" or "⚠️ 190 L/min — Yellow zone, watch closely") and close it.

This means the phone never holds any credential at all — the permission to write data lives entirely in the Action, scoped to just this repo.

## Keeping the dashboard's zone bands in sync — `.github/workflows/sync-config.yml`
Since the static dashboard can only read files, not repo Variables directly, a small `workflow_dispatch`-triggered workflow reads `vars.GREEN_MIN`, `vars.GREEN_MAX`, `vars.YELLOW_MIN`, `vars.YELLOW_MAX`, `vars.RED_MAX` and writes them into `data/config.json`, then commits. Run this manually from the Actions tab any time you update the threshold variables in Settings (e.g. after a doctor visit changes the numbers).

## Making entry fast on the phone
- In the GitHub mobile app: Repo → Issues → "+" → select the "Log a reading" template. Two-ish taps to get to the form.
- Even faster: save a browser bookmark (or homescreen icon) to the direct URL `https://github.com/<you>/peak-flow-tracker/issues/new?template=reading.yml` — this jumps straight to the pre-filled form, skipping the repo navigation.

## Dashboard (`index.html`)
- Fetches `data/readings.json` and `data/config.json` directly (both are static files served by Pages).
- Line chart (Chart.js) of peak flow over time, with horizontal shaded bands for green/yellow/red zones behind the data line.
- Distinct marker for readings taken after rescue-inhaler use.
- Summary stats: current personal best, % of time in each zone over the last 30/60/90 days, longest green-zone streak, rescue-inhaler-use frequency trend.
- Sortable/filterable table below the chart with all raw entries (handy to bring to a doctor visit).
- Fully responsive: single-column layout on phone, wider layout on desktop.

## Zone logic to implement
Driven entirely by the `GREEN_MIN`/`GREEN_MAX`, `YELLOW_MIN`/`YELLOW_MAX`, and `RED_MAX` repo variables (defaults above match the NIH-style green ≥80%, yellow 50–79%, red <50% ratios, but are just plain L/min cutoffs once set — no percentage math needed at runtime):
- **Green**: good control, continue regular medication.
- **Yellow**: caution — if it persists across readings, flag to take rescue medication and consider a doctor call.
- **Red**: medical alert — flag prominently to use rescue inhaler immediately and contact doctor/ER.
- If both a before- and after-rescue reading are entered and PEF increases ≥20%, surface that too (matches the guide's criterion for "add more controller medicine — talk to your doctor").

## Seed/test data
To validate the dashboard (chart rendering, zone bands, history table) before real measurements start coming in, `data/readings.json` should ship with ~15–20 sample entries spanning about two weeks, exercising:
- A run of AM/PM readings that stay comfortably in **green**.
- A few entries that dip into **yellow**, including at least one with `beforeRescue: true` and an `afterRescueBest` showing the ≥20% improvement case.
- At least one **red**-zone entry to confirm that state renders/flags correctly.
- A mix of symptom checkboxes and notes filled in vs. left blank, to confirm the history table and chart both handle sparse fields gracefully.
- Values distributed non-linearly (not a straight line) so the chart's shape is actually visible/meaningful during a visual check.

## Resetting to real data — `.github/workflows/reset-data.yml`
A manually-triggered (`workflow_dispatch`) workflow, same pattern as `sync-config.yml`, that overwrites `data/readings.json` with an empty array `[]` and commits. Run it once from the Actions tab when you're ready to stop looking at sample data and start logging real measurements — no manual file editing needed, and it keeps a clean commit boundary in the repo history between "test data" and "real data."
- PWA manifest + service worker so `entry.html` can be added to the phone's home screen and works offline, syncing once back online.
- CSV export button on the dashboard matching the paper diary's layout, for printing before appointments.
- Optional scheduled GitHub Action that checks recent entries and opens a repo issue/discussion digest if red-zone frequency crosses a threshold.

## Access / privacy notes
- No PAT is needed anywhere with this design — writing to the repo happens inside the Action using its automatic `GITHUB_TOKEN`, not from your phone.
- Anyone who needs to *log* a reading just needs to be a collaborator on the repo (so they can open issues) — no separate credential to manage.
- **Repo stays public, but de-identified.** Since no name, birthdate, or other identifying info will be stored, a public repo is fine and avoids the paid-plan/private-Pages complication entirely. To keep it that way:
  - `config.json` has no `patientName` field (or leave it blank/generic, e.g. `"Tracker"`).
  - Issue template and dashboard use generic labels ("Reading", "Log a reading") — nothing that says whose data this is.
  - Avoid putting the child's name or any other identifying detail in issue titles/comments, commit messages, or the repo name/description itself.
  - Dates/times of readings are still visible publicly, which is a reasonable tradeoff for a de-identified tracker, but worth being aware of if that ever matters.

## Suggested first prompt to paste into Claude Code
> Build a peak flow tracking repo structured for GitHub Pages. This will be a public repo, so keep everything de-identified — no patient name anywhere in the code, config, UI copy, commit messages, or repo description; use generic labels like "Reading" / "Log a reading" throughout. Readings come in exclusively through a GitHub Issue Form (`.github/ISSUE_TEMPLATE/reading.yml`) — no web entry form, no client-side tokens. Set up repo Variables for `ALLOWED_USERS` (default `jeffpaul`), `GREEN_MIN`, `GREEN_MAX`, `YELLOW_MIN`, `YELLOW_MAX`, and `RED_MAX` (default to 240/300/150/240/150 respectively) — document how to set these in Settings → Secrets and variables → Actions. Build `.github/workflows/ingest-reading.yml`, triggered on new "reading"-labeled issues: first check the issue author against `ALLOWED_USERS` and close+comment if unauthorized, otherwise parse the issue, compute best-of-3 and the zone using the threshold variables, append to `data/readings.json`, comment with the result, and close the issue. Build `.github/workflows/sync-config.yml`, a manually-triggered workflow that writes the current threshold variables into `data/config.json` for the dashboard to read. Build `.github/workflows/reset-data.yml`, a manually-triggered workflow that wipes `data/readings.json` back to an empty array. Seed `data/readings.json` with ~15-20 realistic sample entries spanning about two weeks that hit green, yellow, and red zones (including a before/after-rescue pair) so the dashboard can be visually validated before real data is entered. Build `index.html` as a read-only dashboard: a Chart.js line chart of peak flow over time with green/yellow/red zone bands sourced from `data/config.json`, plus a history table, both reading from `data/readings.json`. Use the schema and logic in `peak-flow-tracker-spec.md` in this repo. Start by scaffolding the repo structure and workflows, then the issue template, then the seed data and dashboard, then test the ingestion + authorization logic with a sample issue.

Drop this spec file into the repo root before starting so Claude Code can reference it throughout the build.
