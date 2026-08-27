<<<<<<< HEAD
# BhedanX Rescue Command

Offline-first disaster-response prototype dashboard for vibration, acoustic activity, persistence, and signal quality. ARIA is a deterministic evidence-fusion score, not machine learning.

## Run

Install Node.js 20+ first, then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The Express API runs at http://localhost:3001 and initializes `server/bhedanx.sqlite` automatically. Use `npm run build` then `npm start` for a production-style local run.

## Current prototype

- Gradual simulated telemetry with start, stop, reset, tapping, high activity, acoustic event, and offline controls.
- Centralized ARIA weighting and priority classification.
- Responsive command dashboard, probe management, local site-grid map, alert log, analytics-ready history charts, report export/print, and settings view.
- JSON API and SQLite telemetry/history persistence. The frontend keeps functioning with local simulation if the backend is unavailable.
- ESP32 hardware is intentionally not implemented; future gateway telemetry enters through `POST /api/telemetry`.

External map tiles and online fonts are not required: the map is an offline local site-grid visualization and the UI uses system fallback when fonts are unavailable.
=======
# BhedanX-Project
>>>>>>> ff27f0c74902e9ef4dd7d13a9b638953d85c29bf
