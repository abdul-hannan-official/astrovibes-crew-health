# AstroVibes Crew Health

Health monitoring software for astronauts on long missions — built from scratch for the **NASA Space Apps Challenge 2026**, Team Astrovibes, Multan.

**Audience:** flight surgeons and mission teams. Astronauts complete a 2-minute daily check-in; the flight surgeon sees the dashboard, triage and trends and decides what to do.

**Live demo:** open `index.html` in any browser, or serve the folder:
```bash
cd astrovibes-crew-health
python3 -m http.server 8000
# then open http://127.0.0.1:8000
```

## What it does

1. **Flight Surgeon Dashboard** — 3 fictional crew members, overall status (Nominal / Watch / Alert / Critical), today's most urgent alerts first, routine check-in reminder, check-in streaks, and a cabin-environment panel (temperature, pressure, CO2, noise, radiation dose).
2. **Daily Check-in (2 minutes)** — heart rate, blood pressure, SpO2, temperature, glucose (optional), sleep, mood, stress, exercise and symptoms. On submit it compares every value with **that astronaut's own 7-day baseline**, returns 1 of 4 triage tiers (All Good / Keep an Eye / Tell Crew Medic / Get Help Now) with a concrete next action, and saves the check-in.
3. **Clickable Body Map** — a 2D SVG human figure. Click Mind, Eyes, Lungs, Heart, Gut, Muscles & bones, or Skin to see that system's indicators, the spaceflight hazard behind them, and guidance.
4. **Vitals & Trends** — heart rate, blood pressure, SpO2, temperature, sleep and exercise; last-24-hours and last-7-days charts (Chart.js via CDN) with the astronaut's own baseline as a dashed line, plus a full data table. Colour-coded nominal / watch / alert / critical.
5. **Alerts & Triage Center** — severity filters (All / Critical / Alert / Watch / Unacknowledged), acknowledge button. Every alert shows rule name, indicator, measured value, threshold, own 7-day baseline, severity, reason and next action.
6. **Rule-based Risk Engine** — named, explainable rules: HR high/low/drift, SpO2 low/drift, BP high/low, temperature high/low, glucose high/low, sleep short / 3 consecutive short nights / drop vs 7-day average, missed exercise countermeasure, mood/stress high, cumulative radiation dose. If data is missing, the app says so — it never guesses. It flags risk; it does not diagnose disease.
7. **NASA Research & Sources** — the 5 Hazards of Human Spaceflight, all 17 HRP Risks (summarised), and ongoing research (Tempus Pro, Standard Measures, CIPHER, ARCHeR, Immune Biomarkers, Thigh Cuff & Brain Fluid Pressure), with the real NASA links. No NASA finding or dataset ID is invented.
8. **Settings** — environment selector (ISS / Spacecraft / Rover / Moon Base / Mars Base) that changes the ground-delay note and escalation advice, low-bandwidth mode (hides charts, syncs critical alerts only), role selector (Astronaut / Crew Medic / Flight Surgeon), privacy note, and demo-data reset.

Also included: routine check-in reminder, check-in streaks (light gamification only), CSV export of readings, environment panel.

## Fictional demo crew — Mission MERIDIAN-1, Day 98 of 180

- **Sara Iqbal** — Commander, 38 — steady all mission.
- **Daniyal Raza** — Flight Engineer, 34 — drifting in the last 3 days (shorter sleep, higher heart rate, lower SpO2). This is the demo's watch/alert story.
- **Laila Noor** — Medical Officer, 31 — mostly steady, one short night after a late shift.

All crew members are fictional. No real astronaut is named.

## Tech

- Vanilla HTML5 / CSS3 / JavaScript only. No build step, no framework.
- Chart.js 4 via CDN, with a graceful fallback: if the CDN is offline, the same data is shown as a table and the app keeps working.
- Data in `localStorage` (key `avch_state_v1`), seeded with deterministic realistic simulated data (14 days × 3 crew). Works fully offline except the Chart.js CDN.
- Dark space theme, green / amber / red colour coding throughout.

## Data honesty

- **All health data is simulated** and labelled SIMULATED everywhere in the app.
- Thresholds are **demonstration thresholds, not medically validated flight standards**.
- NASA facts come only from https://www.nasa.gov/hrp/hazards/, https://www.nasa.gov/hrp/risks/ and https://www.nasa.gov/hrp/ongoing-hrp-research/ — the three links on the official challenge page. No downloadable NASA dataset was available from those pages, so no real sensor data is claimed.
- Not a NASA product, not endorsed by NASA, not a medical device, not clinically validated.

## Files

- `index.html` — all 8 screens (Dashboard, Daily Check-in, Body Map, Vitals & Trends, Alerts & Triage, Crew Detail, NASA Research, Settings).
- `styles.css` — dark space theme.
- `app.js` — seed data, risk engine, triage, rendering, charts, localStorage, CSV export.
- `README.md` — this file.

## Tested

Served locally with `python3 -m http.server`, then tested in a headless DOM (jsdom): every screen renders, a normal check-in returns "All Good", a critical check-in (SpO2 88%, HR 128) returns "Get Help Now" with critical flags, all 7 body-map regions render their system info, environment and low-bandwidth toggles change the UI, and the risk-engine unit checks pass. See the test log in the build report for details.
