# BhedanX Rescue Command

BhedanX is an offline-first rescue dashboard: `Piezo -> ESP32 Probe -> ESP-NOW -> ESP32 Gateway -> USB Serial -> Node.js -> SQLite -> React`.

## Run

Requires Node.js 20+.

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:3001`. For a built local run use `npm.cmd run build` followed by `npm.cmd start`.

## Demo Mode

Select `DEMO` in Settings, then click `RUN FULL DEMO` for the 35-second P-01 sequence. `RESET` clears simulated probes, history, and temporary alerts only.

## Hardware Mode

Wire the piezo to GPIO34, configure the gateway MAC in `firmware/probe/probe.ino`, and upload both firmware sketches. Find the gateway COM port in Device Manager, then run:

```powershell
$env:BHEDANX_SERIAL_PORT = "COM5"
$env:BHEDANX_DATA_SOURCE = "REAL_HARDWARE"
npm.cmd start
```

Run Vite separately with `npm.cmd run dev` for the dashboard and select `REAL HARDWARE` in Settings. Valid newline-delimited gateway JSON is stored in SQLite, updates the probe and history graph, creates transition alerts, and drives offline detection. The ESP32 score remains primary.

See [docs/hardware-setup.md](docs/hardware-setup.md) and [docs/serial-setup.md](docs/serial-setup.md) for wiring and troubleshooting.

## Final Demo

1. Run `npm.cmd run dev` and open the dashboard.
2. Select `DEMO`, then click `RUN FULL DEMO`.
3. Observe score, status, chart, alert, map marker, and acknowledgement.
4. For hardware, set the serial variables, start the backend, select `REAL HARDWARE`, and tap the piezo.

## Limitations

Hardware verification requires physical ESP32 boards, an Arduino toolchain, and a configured gateway MAC. Acoustic and battery values are unavailable unless supplied by telemetry. The map is an offline local site grid, not GPS.
