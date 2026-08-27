# BhedanX Stage 3 - Serial Communication Setup

## Overview

The Gateway ESP32 communicates with the Node.js backend via USB serial port. The backend reads JSON telemetry packets and makes them available to the React dashboard.

## Serial Protocol Specification

### Baud Rate
- **115200** (standard)
- Not configurable without code changes

### Output Format
All telemetry is output as **one JSON object per line** (newline-delimited JSON).

### Packet Types

**1. Telemetry Packet** (from probe via ESP-NOW)
```json
{"probeId":"P-01","timestamp":12345,"vibration":82,"acoustic":0,"persistence":75,"signalQuality":90,"priorityScore":76,"status":"HIGH_PRIORITY"}
```

**2. Gateway Heartbeat** (every 5 seconds)
```json
{"type":"GATEWAY_HEARTBEAT","timestamp":12345,"packetsReceived":127,"lastPacketTime":12340}
```

**3. Gateway Startup** (when gateway boots)
```json
{"type":"GATEWAY_STARTUP","version":"1.0","timestamp":12345}
```

### Debug Output (optional)
```
DEBUG: Your debug message here
```

Debug output is prefixed with `DEBUG:` and should be ignored by parsers.

## Finding Your Serial Port

### Windows
1. Open Device Manager (`devmgmt.msc`)
2. Expand "Ports (COM & LPT)"
3. Look for device like "USB Serial Device (COM5)"
4. Note the COM port number

### Linux
```bash
# List USB serial devices
ls -la /dev/ttyUSB*

# Or check dmesg for device info
dmesg | grep ttyUSB
```

Typical ports: `/dev/ttyUSB0`, `/dev/ttyUSB1`

### macOS
```bash
# List serial ports
ls /dev/cu.usbserial*

# Or with more detail
system_profiler SPUSBDataType | grep -A 10 "USB Serial"
```

Typical ports: `/dev/cu.usbserial-xxxxx`

## Node.js Serial Service

### Installation

Required package (already in `package.json`):
```bash
npm install serialport
```

### Usage

The BhedanX backend automatically initializes the serial service:

```javascript
// server/services/serialService.js
const SerialService = require('./services/serialService');

const serial = new SerialService({
  port: process.env.BHEDANX_SERIAL_PORT,  // e.g., "COM5" or "/dev/ttyUSB0"
  baudRate: 115200,
  autoOpen: true
});

// Listen for telemetry
serial.on('telemetry', (data) => {
  console.log('Received:', data.probeId, data.priorityScore);
});

// Listen for connection events
serial.on('connected', () => {
  console.log('Gateway connected');
});

serial.on('disconnected', () => {
  console.log('Gateway disconnected');
});

serial.on('error', (err) => {
  console.error('Serial error:', err.message);
});
```

## Configuration

### Environment Variable Method

Set `BHEDANX_SERIAL_PORT` before starting the backend:

**Windows (Command Prompt):**
```cmd
set BHEDANX_SERIAL_PORT=COM5
npm run dev
```

**Windows (PowerShell):**
```powershell
$env:BHEDANX_SERIAL_PORT = "COM5"
npm run dev
```

**Linux/macOS (Bash):**
```bash
export BHEDANX_SERIAL_PORT=/dev/ttyUSB0
npm run dev
```

### Hardcoded Configuration

Edit `server/index.js` if environment variables don't work:

```javascript
const gatewayPort = process.env.BHEDANX_SERIAL_PORT || 'COM5';  // Change default
```

## Testing Serial Connection

### Manual Testing with Serial Monitor

1. **Upload Gateway firmware**
2. **Open Serial Monitor**
   - Arduino IDE: Tools → Serial Monitor
   - Settings: 115200 baud, No line ending
3. **Should see (after ~2 seconds):**
   ```
   {"type":"GATEWAY_STARTUP"...}
   ```
4. **After probe starts sending (5-10 seconds):**
   ```
   {"probeId":"P-01","timestamp":1234..."}}
   {"probeId":"P-01","timestamp":1235..."}}
   ```

### Testing with Node.js

Create `test-serial.js`:

```javascript
const SerialService = require('./server/services/serialService');

const serial = new SerialService({
  port: process.env.BHEDANX_SERIAL_PORT || 'COM5',
  baudRate: 115200,
  autoOpen: true
});

serial.on('telemetry', (data) => {
  console.log(`[Telemetry] ${data.probeId}: Priority ${data.priorityScore} (${data.status})`);
});

serial.on('gateway-heartbeat', (data) => {
  console.log(`[Heartbeat] Packets: ${data.packetsReceived}`);
});

serial.on('connected', () => {
  console.log('[Connected] Gateway online');
});

serial.on('disconnected', () => {
  console.log('[Disconnected] Gateway offline - attempting to reconnect');
});

serial.on('error', (err) => {
  console.error('[Error]', err.message);
});

setTimeout(() => process.exit(0), 60000); // Exit after 60 seconds
```

Run with:
```bash
set BHEDANX_SERIAL_PORT=COM5
node test-serial.js
```

## Packet Validation

The backend validates all telemetry packets:

```javascript
// Check fields
- probeId: must exist
- timestamp: must be a number
- vibration: 0-100
- acoustic: 0-100
- persistence: 0-100
- signalQuality: 0-100
- priorityScore: 0-100
- status: must be set
```

Invalid packets are logged and discarded (don't crash the backend).

## Troubleshooting

### Problem: "Port not found"
- Check serial port name in environment variable
- Verify USB cable connection
- Try Device Manager to find correct port
- Check port is not already in use by another app

### Problem: "Permission denied" (Linux/macOS)
Add user to dialout group:
```bash
sudo usermod -a -G dialout $USER
# Log out and back in for changes to take effect
```

Or run with sudo:
```bash
sudo bash -c 'export BHEDANX_SERIAL_PORT=/dev/ttyUSB0; npm run dev'
```

### Problem: "Connection established but no data"
1. Verify Gateway firmware uploaded correctly
2. Check Serial Monitor separately (open different tab)
3. Ensure Gateway board is powered
4. Try unplugging/replugging USB cable
5. Check for conflicting applications (Terminal, PuTTY, etc.)

### Problem: "Garbled output"
- Verify baud rate is 115200
- Check USB cable quality
- Try different USB port
- Check cable is fully inserted

### Problem: "Frequent disconnections"
- Use high-quality USB cable
- Check for USB hub issues (try direct port)
- Reduce serial operations if running intensive backend tasks
- Check for driver issues (update CH340/PL2303 drivers on Windows)

## Multiple Gateways

To use multiple gateways simultaneously:

1. Create separate serial service instances
2. Map each to different port
3. Merge telemetry from multiple gateways

Example:
```javascript
const serial1 = new SerialService({ port: 'COM5' });
const serial2 = new SerialService({ port: 'COM6' });

serial1.on('telemetry', (data) => {
  broadcastTelemetry(data, 'gateway-1');
});

serial2.on('telemetry', (data) => {
  broadcastTelemetry(data, 'gateway-2');
});
```

## Performance

- **Latency:** <50ms from gateway to backend
- **Throughput:** 115200 baud ≈ 14,400 bytes/sec
- **Max probes per gateway:** 8+ (each sends ~22 bytes every 1.8 sec)
- **Reliability:** Extremely high (hardware-level error detection)

## Related Documentation

- [Hardware Setup Guide](hardware-setup.md) - Hardware wiring and configuration
- [Testing Guide](testing.md) - Complete system testing
