# BhedanX Stage 3 - Testing Guide

## Complete System Testing Procedure

This document provides a step-by-step guide to test the entire BhedanX system from hardware through dashboard.

## Pre-Test Checklist

- [ ] Both ESP32 boards received and powered
- [ ] Piezo sensor connected to Probe GPIO34
- [ ] Gateway MAC address identified
- [ ] Probe firmware updated with Gateway MAC
- [ ] Arduino IDE or PlatformIO installed
- [ ] Node.js and npm installed
- [ ] Serial terminal app available (Arduino IDE Serial Monitor)

## Test Sequence

### TEST 1: Probe Firmware Compilation

**Objective:** Verify probe firmware compiles without errors

**Steps:**
1. Open `firmware/probe/probe.ino` in Arduino IDE
2. Verify Gateway MAC is set correctly (line ~25)
3. Select: Tools → Board → ESP32 Dev Module
4. Click Verify (checkmark icon)
5. Should complete without errors

**Expected Result:** Compilation successful, hex file generated

**If Failed:**
- Check for typos in MAC address
- Ensure Arduino library is installed
- Try updating ESP32 board support

---

### TEST 2: Gateway Firmware Compilation

**Objective:** Verify gateway firmware compiles without errors

**Steps:**
1. Open `firmware/gateway/gateway.ino` in Arduino IDE
2. Select: Tools → Board → ESP32 Dev Module
3. Click Verify (checkmark icon)
4. Should complete without errors

**Expected Result:** Compilation successful

**If Failed:**
- Ensure ArduinoJson library is installed
- Try updating ESP32 board support
- Check for syntax errors

---

### TEST 3: Upload Gateway Firmware

**Objective:** Flash gateway firmware to first ESP32 board

**Steps:**
1. Connect Gateway ESP32 via USB
2. Open `firmware/gateway/gateway.ino`
3. Select: Tools → Port → (Gateway COM port)
4. Click Upload (arrow icon)
5. Wait for "Uploading..." to complete
6. Should see "Done uploading" message

**Expected Result:** Upload successful, board resets

**If Failed:**
- Check USB cable connection
- Try different USB port
- Install CH340 drivers (if needed)
- Reset board manually (press Reset button)

---

### TEST 4: Verify Gateway Serial Output

**Objective:** Confirm gateway is running and outputting JSON

**Steps:**
1. Open Serial Monitor (Tools → Serial Monitor)
2. Verify baud rate is 115200
3. Look at output (should appear within 2 seconds)
4. Note the Gateway MAC address from startup message

**Expected Output:**
```
{"type":"GATEWAY_STARTUP","version":"1.0","timestamp":1234}
{"type":"GATEWAY_HEARTBEAT","timestamp":1250,"packetsReceived":0,"lastPacketTime":0}
{"type":"GATEWAY_HEARTBEAT","timestamp":1255,"packetsReceived":0,"lastPacketTime":0}
```

**If Nothing Appears:**
- Check USB connection
- Try different COM port
- Reset gateway board
- Verify upload was successful

---

### TEST 5: Upload Probe Firmware

**Objective:** Flash probe firmware to second ESP32 board

**Steps:**
1. Disconnect Gateway USB (or switch cable to other ESP32)
2. Connect Probe ESP32 via USB
3. Open `firmware/probe/probe.ino`
4. Verify Gateway MAC is correct (line ~25)
5. Select: Tools → Port → (Probe COM port)
6. Click Upload (arrow icon)
7. Wait for upload to complete

**Expected Result:** Upload successful

**If Failed:**
- Check MAC address format in code
- Try different USB cable
- Reset probe board

---

### TEST 6: Verify Probe → ESP-NOW → Gateway

**Objective:** Confirm probe can send data to gateway

**Steps:**
1. Keep Probe USB connected
2. Open Serial Monitor for Probe
3. Wait 2-3 seconds for initialization
4. Watch for debug output
5. Disconnect Probe USB (keep power, if available)
6. Reconnect Gateway USB to computer
7. Open Serial Monitor for Gateway
8. Wait 5-10 seconds
9. Should see JSON telemetry packets

**Expected Output (Gateway Serial Monitor):**
```
{"probeId":"P-01","timestamp":1234,"vibration":45,"acoustic":0,"persistence":30,"signalQuality":90,"priorityScore":38,"status":"SUSPICIOUS"}
{"probeId":"P-01","timestamp":3034,"vibration":48,"acoustic":0,"persistence":32,"signalQuality":89,"priorityScore":41,"status":"SUSPICIOUS"}
```

**If No Telemetry Appears:**
- Check Gateway MAC in probe.ino matches gateway's actual MAC
- Verify both boards have power
- Move boards closer together (ESP-NOW range)
- Check Serial Monitor is reading correct port
- Look for debug messages (may need to enable SERIAL_DEBUG)

---

### TEST 7: Verify JSON Format

**Objective:** Confirm telemetry JSON is valid and parseable

**Steps:**
1. Copy a JSON line from Serial Monitor
2. Validate at [jsonlint.com](https://www.jsonlint.com/)
3. Check for these required fields:
   - `probeId`: "P-01" (string)
   - `timestamp`: number
   - `vibration`: 0-100 (number)
   - `acoustic`: 0-100 (number)
   - `persistence`: 0-100 (number)
   - `signalQuality`: 0-100 (number)
   - `priorityScore`: 0-100 (number)
   - `status`: "NORMAL"|"SUSPICIOUS"|"HIGH_PRIORITY"|"CRITICAL"

**Expected Result:** Valid JSON with all required fields

**If Invalid:**
- Check ArduinoJson library version
- Verify status string is spelled correctly
- Check for value ranges (0-100)

---

### TEST 8: Connect Gateway USB to Computer

**Objective:** Prepare gateway for backend communication

**Steps:**
1. Disconnect Serial Monitor
2. Note the COM port (e.g., COM5)
3. Keep gateway connected via this USB port

**Expected Result:** Gateway appears in Device Manager as USB Serial Device

---

### TEST 9: Start Node.js Backend

**Objective:** Start the backend server to receive telemetry

**Steps:**
1. Open command prompt/terminal
2. Navigate to project: `cd c:\Users\...\BhedanX-prjt`
3. Set environment variable:
   - Windows: `set BHEDANX_SERIAL_PORT=COM5` (replace with your port)
   - Linux: `export BHEDANX_SERIAL_PORT=/dev/ttyUSB0`
4. Start backend: `npm run dev`
5. Wait for message: "BhedanX API listening on http://localhost:3001"

**Expected Output:**
```
[Server] BhedanX API listening on http://localhost:3001
[Server] Data source: DEMO
[Server] Serial port configured: COM5
```

**If Port Not Found:**
- Double-check COM port in Device Manager
- Verify environment variable is set
- Try hardcoding port in server/index.js
- Check no other app is using the port

---

### TEST 10: Verify Backend Receives Telemetry

**Objective:** Confirm backend is reading from gateway

**Steps:**
1. Open browser: http://localhost:3001/api/gateway/status
2. Should see JSON with gateway status
3. Check for `connected: true`
4. Packets should be incrementing

**Expected Response:**
```json
{
  "connected": true,
  "status": "ONLINE",
  "espnowStatus": "CONNECTED",
  "portName": "COM5",
  "packetsReceived": 42,
  "lastPacketTime": "2025-08-27T15:34:21.123Z"
}
```

**If Not Connected:**
- Check serial port is correct
- Verify gateway is sending JSON (open Serial Monitor separately)
- Restart backend and gateway
- Check for error messages in backend console

---

### TEST 11: Start React Dashboard

**Objective:** Launch the frontend application

**Steps:**
1. Open new terminal/command prompt
2. Navigate to project
3. Start Vite: `npm run dev` (in separate window)
4. Dashboard should open at http://localhost:5173/
5. Should load without errors

**Expected Result:** Dashboard loads, shows demo data initially

---

### TEST 12: Switch to Real Hardware Mode

**Objective:** Switch dashboard from demo to real hardware data

**Steps:**
1. Dashboard should be loaded
2. Look for "REAL HARDWARE" button in demo bar
3. Click "REAL HARDWARE" button
4. Button should become highlighted/active
5. Data should start updating from gateway

**Expected Result:**
- Button shows as active
- Gateway Status panel shows ONLINE
- Probe data updates every ~1.8 seconds
- Status may show HIGH_PRIORITY based on sensor activity

**If Still Shows Demo Data:**
- Check backend is still running
- Verify gateway shows ONLINE status
- Check browser console for errors
- Reload page with Ctrl+R

---

### TEST 13: Trigger Probe Activity

**Objective:** Test real sensor input from probe

**Steps:**
1. Locate the piezo sensor on the Probe ESP32
2. Gently tap the area near the sensor 5-10 times
3. Watch the dashboard for changes:
   - Vibration value should increase
   - Priority score may increase
   - Status may change to HIGH_PRIORITY
   - Alert may appear if score goes high enough

**Expected Result:**
- Dashboard updates reflect tapping activity
- Vibration increases from baseline
- Multiple updates show in chart

**If No Change:**
- Check piezo is properly connected to GPIO34
- Verify sensor isn't physically damaged
- Tap harder or closer to sensor
- Check NOISE_THRESHOLD in probe.ino (may be too high)

---

### TEST 14: Generate High-Priority Event

**Objective:** Trigger an alert by generating high activity

**Steps:**
1. Tap the probe sensor firmly and repeatedly for 5 seconds
2. Watch dashboard closely
3. When priority score exceeds 60, status should change
4. When score exceeds 80, status should become CRITICAL
5. Alert should appear in "RECENT ALERTS" section

**Expected Result:**
- Status changes to HIGH_PRIORITY or CRITICAL
- Red/orange alert appears
- Alert includes probe ID and time
- Priority Score reflects sensor activity

**If No Alert:**
- Check alerts aren't being filtered
- Verify status actually changed
- Check console for errors
- May need stronger/longer tapping

---

### TEST 15: Verify Alert Acknowledgment

**Objective:** Test alert acknowledgment system

**Steps:**
1. Wait for an alert to appear
2. Click "ACK" button on alert
3. Button should disappear or change appearance
4. Navigate to "Alerts" page to see full history
5. Acknowledged alerts should show as acknowledged

**Expected Result:**
- ACK button removes from alert
- Alert still visible in full history
- Alert marked as acknowledged

---

### TEST 16: Probe Offline Simulation (Demo Mode)

**Objective:** Test offline probe handling

**Steps:**
1. Switch to DEMO mode (click "DEMO" button)
2. Click "SIMULATE PROBE OFFLINE" button
3. Selected probe should show as OFFLINE
4. Dashboard should show "PROBE OFFLINE"
5. No telemetry values should update
6. Alert should appear

**Expected Result:**
- Probe status shows OFFLINE
- Last priority and battery displayed
- "SIMULATE PROBE ONLINE" button appears
- Alert generated for offline event

**Note:** This test uses simulation; real hardware would require actually powering off the probe.

---

### TEST 17: Chart Updates in Real Time

**Objective:** Verify telemetry chart shows live data

**Steps:**
1. Switch to REAL HARDWARE mode
2. View "ARIA SIGNAL ANALYSIS" chart on Dashboard
3. Watch for new data points being added
4. Chart should scroll left, adding new points on right
5. Watch for 30-60 seconds

**Expected Result:**
- Chart shows continuous updates
- New points added every 1.8 seconds
- Chart maintains last 30 data points
- Vibration (red) reflects sensor activity

---

### TEST 18: System Status Verification

**Objective:** Verify all system diagnostics are correct

**Steps:**
1. Check Dashboard top-right corner
2. Verify: "SYSTEM ONLINE" indicator
3. Check Gateway Status panel:
   - STATUS: ONLINE
   - ESP-NOW: CONNECTED
   - PACKETS RECEIVED: > 0
   - LAST PACKET: within last 5 seconds
4. Check footer: "SYSTEM ONLINE"

**Expected Result:** All indicators show system is healthy

---

## Advanced Testing

### Battery Drain Observation
1. Run system for 5+ minutes
2. Watch Battery % in probe panel
3. Should decrease gradually (~0.1-0.3% per update)
4. Should NOT decrease rapidly

### Communication Weakness Detection
1. Move probe farther from gateway
2. After extended time, may see Communication: WEAK
3. Signal Quality should decrease
4. System continues working even with weak signal

### Multiple Probe Setup
1. Add second probe with different PROBE_ID
2. Both probes send to same gateway
3. Dashboard should show both probes
4. Can select and monitor each independently

### Long-Running Stability
1. Let system run for 30+ minutes
2. Check for memory leaks (dashboard responsiveness)
3. Verify backend still responsive
4. Check serial connection remains stable
5. No unexpected errors in console

## Post-Test Checklist

- [ ] Probe firmware compiles successfully
- [ ] Gateway firmware compiles successfully
- [ ] Gateway outputs valid JSON to serial
- [ ] Probe sends packets to gateway via ESP-NOW
- [ ] Backend receives telemetry from gateway
- [ ] Dashboard loads and displays data
- [ ] Real hardware mode switch works
- [ ] Sensor tapping produces measurable changes
- [ ] Alerts generate at high priority
- [ ] Chart updates in real time
- [ ] System runs stably for extended period
- [ ] All status indicators show healthy

## Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| Gateway not outputting JSON | Check baud rate (115200), verify upload |
| No data reaching backend | Verify BHEDANX_SERIAL_PORT environment var |
| Dashboard shows demo instead of real data | Click REAL HARDWARE button, check gateway ONLINE |
| Probe not detected | Verify Gateway MAC in probe.ino |
| Sensor not responding | Check GPIO34 connection, adjust NOISE_THRESHOLD |
| No alerts generated | Verify tapping is sufficient, check score thresholds |
| Connection drops frequently | Check USB cable quality, move boards closer |

## Success Criteria

System is ready for demonstration when:
1. ✅ All 18 tests pass
2. ✅ No console errors
3. ✅ Real hardware data flows end-to-end
4. ✅ Sensor activity triggers alerts appropriately
5. ✅ Dashboard remains responsive
6. ✅ System stable for 30+ minutes

## Next Steps

- [Hardware Setup Guide](hardware-setup.md) - Detailed hardware instructions
- [Serial Setup Guide](serial-setup.md) - Serial communication details
- [ESP-NOW Setup Guide](espnow-setup.md) - Wireless protocol details
