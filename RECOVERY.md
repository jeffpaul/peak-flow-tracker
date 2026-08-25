# Recovery notes

This file exists so you can pick this project back up after a machine reformat.

## What this project is

Peak Flow Tracker logs a child's peak flow meter readings from a phone and shows trends on a dashboard. The repo is public but de-identified. No name or birthdate appears anywhere in it.

The site runs on GitHub Pages. It has no backend server.

You log a reading two ways. You fill out `log.html`, and it redirects to a pre-filled GitHub issue. Or you open the GitHub issue template directly.

A GitHub Action called `Ingest Reading` reads each new issue. It parses the form, computes the best reading and its zone, and appends the entry to `data/readings.json`. It comments on the issue with the result and closes it.

A second Action, `Validate Data`, checks the shape of `data/readings.json` and `data/config.json` on every push.

The dashboard, `index.html`, reads both data files. It renders a chart, summary stats, and a paginated history table.

The README at the repo root covers setup, the data model, and the full file layout in more detail.

## Current state

The repo is live and working. Real data has replaced all seed and test data.

`data/readings.json` holds 26 real entries, spanning 2026-07-02 through 2026-08-24. Both GitHub Actions run cleanly. The favicon and iOS home-screen icon are built and wired into both pages.

The working tree is clean. Nothing is uncommitted. Nothing is unpushed.

## What I was actively working on

The task right before this audit was clearing seed and test data out of `data/readings.json`, keeping only real entries. That work is done and pushed.

Before that, I built and shipped a favicon and an apple-touch-icon for the site: a wind glyph on a blue background.

I also gave a recommendation on GitHub repo Topics for search discoverability. You have not added them yet.

## Next 2-3 steps

1. Add GitHub repo Topics for discoverability. Recommended list: `asthma-tracker`, `peak-flow`, `health-tracker`, `quantified-self`, `github-pages`, `github-actions`, `serverless`, `javascript`.
2. Keep logging real readings through `log.html` or the issue template. The pipeline works end to end.
3. If the zone thresholds in `data/config.json` ever change after a doctor visit, hand-edit that file directly. No code change is needed.
