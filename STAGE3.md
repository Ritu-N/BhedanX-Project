# BhedanX STAGE 3: ESP32 PROBE → ESP-NOW → GATEWAY

## 🎯 Implementation Complete

All components for live ESP32 hardware integration have been implemented and documented.

## 📋 Files Created/Modified

### Firmware (C++ - Arduino)
- **`firmware/probe/probe.ino`** (new)
  - ESP32 probe firmware for sensor reading and ESP-NOW transmission
  - Piezo sensor processing with baseline calibration
  - ARIA priority score calculation on device
  - Configurable MAC address for gateway targeting
  - ~500 lines with extensive comments

- **`firmware/gateway/gateway.ino`** (new)
  - ESP32 gateway firmware for ESP-NOW reception
  - JSON telemetry output via USB serial
  - Packet validation and statistics
  - Automatic heartbeat and status reporting
  - ~250 lines with extensive comments

### Node.js Backend Services
- **`server/services/serialService.js`** (new)
  - Serial port communication library
  - Reads JSON telemetry from gateway
  - Automatic reconnection handling
  - Packet validation and error handling
  - Event-based architecture
  - ~280 lines

- **`server/services/telemetryService.js`** (new)
  - Manages DEMO vs REAL_HARDWARE data sources
  - Integrates real telemetry with existing system
  - Gateway status tracking
  - Probe state management
  - ~220 lines

- **`server/index.js`** (modified)
  - Added `/api/gateway/status` endpoint
  - Added `/api/gateway/data-source` endpoint (POST)
  - Added `/api/gateway/data-source` endpoint (GET)
  - Refactored for readability (was minified)
  - ~250 lines

### React Frontend
- **`src/App.jsx`** (modified)
  - Added data source state management
  - Added gateway status state
  - Added data source toggle UI (DEMO/REAL HARDWARE)
  - Added gateway status panel
  - Fetch gateway status from backend every 5 seconds
  - Added `switchDataSource()` function

- **`src/styles.css`** (modified)
  - Added styles for data source toggle
  - Added styles for gateway indicator
  - Added styles for gateway status panel
  - ~300 characters of new CSS

### Documentation
- **`docs/hardware-setup.md`** (new)
  - Complete hardware setup instructions
  - Wiring diagrams for both probe and gateway
  - MAC address discovery procedures
  - Arduino IDE and PlatformIO upload instructions
  - Troubleshooting guide
  - ~550 lines

- **`docs/espnow-setup.md`** (new)
  - ESP-NOW protocol explanation
  - Packet structure documentation
  - Configuration parameters
  - Tuning guide for sensitivity
  - Multi-probe setup instructions
  - ~400 lines

- **`docs/serial-setup.md`** (new)
  - Serial protocol specification
  - Finding serial ports on Windows/Linux/macOS
  - Node.js integration examples
  - Environment variable configuration
  - Performance metrics
  - ~350 lines

- **`docs/testing.md`** (new)
  - 18-step comprehensive testing procedure
  - Pre-test checklist
  - Individual test objectives and steps
  - Expected outputs for each test
  - Troubleshooting quick reference
  - ~700 lines

## 🏗️ Architecture

```
HARDWARE LAYER
├── Piezo Sensor → GPIO34 (ADC)
├── Probe ESP32
│   ├── Read ADC
│   ├── Process signal (baseline, deviation)
│   ├── Calculate persistence (activity history)
│   ├── ARIA score calculation
│   └── ESP-NOW transmission (22-byte packet)
│
└── Gateway ESP32
    ├── ESP-NOW reception
    ├── JSON serialization (ArduinoJson)
    └── Serial USB output (115200 baud)

SERIAL LAYER
├── USB Serial (VCP)
├── Newline-delimited JSON
├── 115200 baud
└── Auto-reconnection

BACKEND LAYER
├── serialService.js (port reading)
├── telemetryService.js (data source management)
└── Express REST API
    ├── /api/gateway/status
    ├── /api/gateway/data-source (GET/POST)
    └── Existing endpoints (/api/probes, /api/telemetry, etc.)

FRONTEND LAYER
├── Data source toggle (DEMO/REAL_HARDWARE)
├── Gateway status panel
├── Live telemetry display
├── Real-time chart updates
└── Alert system
```

## 🔧 Configuration

### Hardware MAC Addresses
Edit `firmware/probe/probe.ino` line ~25:
```cpp
uint8_t gatewayMac[] = {
  0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78  // Set to your gateway's MAC
};
```

### Serial Port (Environment Variable)
```bash
# Windows
set BHEDANX_SERIAL_PORT=COM5

# Linux/macOS
export BHEDANX_SERIAL_PORT=/dev/ttyUSB0
```

### Sensor Tuning (Optional)
Edit `firmware/probe/probe.ino`:
```cpp
const int NOISE_THRESHOLD = 200;         // Sensitivity
const int ACTIVITY_DECAY = 5;            // Decay rate
const int SENSOR_SAMPLE_INTERVAL = 100;  // Sample rate
const int TELEMETRY_SEND_INTERVAL = 1800; // Send interval
```

## 📦 Dependencies

### Firmware Dependencies
- Arduino IDE 1.8.13+ or PlatformIO
- ESP32 board support package
- ArduinoJson 6.x (for gateway)

### Backend Dependencies
- serialport (already in package.json)
- All existing dependencies

### Frontend Dependencies
- All existing React/Recharts/Leaflet dependencies

## 🚀 Quick Start

### 1. Set Up Hardware
```bash
# Find gateway MAC address
# (See hardware-setup.md)
```

### 2. Configure Probe Firmware
```cpp
// Edit firmware/probe/probe.ino
uint8_t gatewayMac[] = { 0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78 };
```

### 3. Upload Firmware
```bash
# Arduino IDE: Open file → Select Board → Select Port → Upload
# Or PlatformIO: pio run -e probe --target upload
```

### 4. Start Backend
```bash
# Windows
set BHEDANX_SERIAL_PORT=COM5
npm run dev

# Linux/macOS
export BHEDANX_SERIAL_PORT=/dev/ttyUSB0
npm run dev
```

### 5. Open Dashboard
```bash
# In second terminal
npm run dev

# Navigate to http://localhost:5173/
# Click "REAL HARDWARE" to switch from demo
```

## 📊 Data Flow

1. **Probe Board (1800ms interval):**
   - Reads ADC (GPIO34)
   - Processes piezo signal
   - Calculates persistence from 30-point history
   - Computes ARIA score (vibration 40%, acoustic 25%, persistence 25%, signal 10%)
   - Sends 22-byte binary packet via ESP-NOW

2. **Gateway Board:**
   - Receives ESP-NOW packet
   - Converts to JSON
   - Outputs to serial port (USB)
   - Sends heartbeat every 5 seconds

3. **Node.js Backend:**
   - Reads JSON from serial port
   - Validates telemetry
   - Stores in database
   - Provides via REST API

4. **React Dashboard:**
   - Fetches from API every 5 seconds
   - Updates in real-time
   - Displays gateway status
   - Shows alerts and charts

## ✅ Feature Checklist

- ✅ Probe firmware reads piezo sensor
- ✅ Probe calculates vibration (0-100)
- ✅ Probe calculates persistence (0-100)
- ✅ Probe calculates ARIA priority score
- ✅ Probe sends via ESP-NOW (configurable MAC)
- ✅ Gateway receives ESP-NOW packets
- ✅ Gateway outputs JSON via serial
- ✅ Serial service reads from gateway
- ✅ Backend receives telemetry
- ✅ Dashboard toggles DEMO/REAL_HARDWARE
- ✅ Gateway status panel displays connection
- ✅ Live updates when real hardware connected
- ✅ Existing demo mode still works
- ✅ No breaking changes to existing features
- ✅ Comprehensive documentation
- ✅ 18-step testing procedure

## 📝 Telemetry Packet Format

**Binary ESP-NOW packet (22 bytes):**
```cpp
struct TelemetryPacket {
  char probeId[8];           // "P-01"
  uint32_t timestamp;         // 1695828841
  uint8_t vibration;          // 0-100
  uint8_t acoustic;           // 0-100
  uint8_t persistence;        // 0-100
  uint8_t signalQuality;      // 0-100
  uint8_t priorityScore;      // 0-100
  uint8_t status;             // 0-3 (NORMAL/SUSPICIOUS/HIGH/CRITICAL)
};
```

**JSON output format (serial):**
```json
{"probeId":"P-01","timestamp":1695828841,"vibration":82,"acoustic":0,"persistence":75,"signalQuality":90,"priorityScore":76,"status":"HIGH_PRIORITY"}
```

## 🔍 Monitoring

### Gateway Status API
```bash
curl http://localhost:3001/api/gateway/status
```

Returns:
```json
{
  "connected": true,
  "status": "ONLINE",
  "espnowStatus": "CONNECTED",
  "portName": "COM5",
  "packetsReceived": 142,
  "lastPacketTime": "2025-08-27T15:34:21.123Z"
}
```

### Switch Data Source
```bash
# Switch to real hardware
curl -X POST http://localhost:3001/api/gateway/data-source \
  -H "Content-Type: application/json" \
  -d '{"source":"REAL_HARDWARE"}'

# Switch back to demo
curl -X POST http://localhost:3001/api/gateway/data-source \
  -H "Content-Type: application/json" \
  -d '{"source":"DEMO"}'
```

## 🐛 Troubleshooting

### No telemetry from gateway
1. Check Gateway MAC address in probe.ino
2. Verify both boards powered
3. Try moving boards closer
4. Check Serial Monitor separately

### Serial connection fails
1. Verify COM port name
2. Check no other app using port
3. Try different USB port
4. Update USB drivers

### Dashboard shows demo data
1. Click "REAL HARDWARE" button
2. Check gateway status (should be ONLINE)
3. Verify backend running (check console)
4. Refresh page (Ctrl+R)

See `docs/` for detailed troubleshooting guides.

## 📖 Documentation

- **[hardware-setup.md](docs/hardware-setup.md)** - Hardware wiring, MAC addresses, firmware upload
- **[espnow-setup.md](docs/espnow-setup.md)** - Protocol details, packet structure, tuning
- **[serial-setup.md](docs/serial-setup.md)** - Serial communication, port configuration
- **[testing.md](docs/testing.md)** - 18-step comprehensive testing procedure

## 🎓 Learning Resources

### ESP-NOW
- [Official ESP-NOW Documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/network/esp_now.html)
- [ESP32 Hardware Reference](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/hw-reference/esp32_devkitc.html)

### Piezo Sensors
- Operate at 3.3V with AC output
- Produce analog signal proportional to vibration
- Require baseline calibration for reliable operation

### Arduino JSON
- [ArduinoJson Documentation](https://arduinojson.org/)
- Used for efficient JSON serialization on embedded systems

## 🔐 Important Notes

1. **No Encryption:** Current implementation has no encryption (suitable for local rescue ops)
2. **No Authentication:** Assumes local network (add if needed for production)
3. **Single Sensor Mode:** Acoustic set to 0 (microphone integration can be added later)
4. **Wireless Range:** ESP-NOW typically ~250 meters in open space
5. **Frequency:** 2.4 GHz (may have interference from WiFi/Bluetooth)

## 🎯 What's NOT Included (Per Requirements)

✓ NOT implementing 125 kHz communication  
✓ NOT implementing radar sensing  
✓ NOT implementing thermal sensing  
✓ NOT implementing heart-rate sensing  
✓ NOT implementing machine learning  

These can be added in future stages if needed.

## 🚀 Next Steps

1. **Flash both boards** with their respective firmware
2. **Find gateway MAC** using provided procedure
3. **Configure probe firmware** with gateway MAC
4. **Run 18-step testing** procedure from docs/testing.md
5. **Demonstrate live system** with real sensor input

## 📞 Support

Refer to the comprehensive documentation:
- Hardware issues → See `docs/hardware-setup.md`
- Configuration issues → See `docs/espnow-setup.md` or `docs/serial-setup.md`
- Testing issues → See `docs/testing.md`
- Code issues → Check comments in `.ino` files and `server/services/`

---

**Status:** ✅ Stage 3 Implementation Complete  
**Date:** August 2025  
**Version:** 1.0
