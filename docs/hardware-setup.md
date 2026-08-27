# BhedanX Stage 3 - Hardware Setup Guide

## Overview

BhedanX requires two ESP32 boards to communicate via ESP-NOW:
- **Probe ESP32** (Node 1): Reads piezo sensor, calculates priority, sends via ESP-NOW
- **Gateway ESP32** (Node 2): Receives telemetry, outputs JSON via USB serial

## Hardware Requirements

### Node 1: Probe ESP32
- ESP32 development board (e.g., ESP32 DevKit v1)
- Piezo sensor (piezoelectric element, ceramic or film type)
- USB cable for programming
- Optional: 3.3V power supply for standalone operation

### Node 2: Gateway ESP32
- ESP32 development board (e.g., ESP32 DevKit v1)
- USB cable (for both programming and computer connection)

### Wiring Diagram

**Probe ESP32 (Node 1):**
```
Piezo Sensor:
  - Signal → GPIO34 (ADC pin)
  - GND → GND
  - Vcc → 3.3V (if needed)

LED (optional status indicator):
  - Signal → GPIO2
  - GND → GND
```

**Gateway ESP32 (Node 2):**
```
USB (for serial communication with computer):
  - USB micro connector to computer
  - Used for: Programming + Data output

LED (optional status indicator):
  - Signal → GPIO2
  - GND → GND
```

## Step 1: Prepare the Hardware

### 1.1 Probe ESP32 Setup
1. Connect the piezo sensor to GPIO34 (analog input)
2. Connect piezo GND to ESP32 GND
3. Connect LED to GPIO2 (optional)
4. Connect USB cable (for initial flashing)

### 1.2 Gateway ESP32 Setup
1. Connect LED to GPIO2 (optional)
2. Connect USB cable (this will be the serial communication port)

## Step 2: Note Your ESP32 MAC Addresses

You need the MAC address of the Gateway ESP32 to configure the Probe.

### Finding ESP32 MAC Address

1. **Upload a simple MAC reader sketch:**

```cpp
#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.print("MAC Address: ");
  Serial.println(WiFi.macAddress());
}

void loop() {
  delay(10000);
}
```

2. **Read the serial monitor output:**
   - Open Arduino IDE or PlatformIO
   - Upload the sketch
   - Open Serial Monitor (115200 baud)
   - Note the MAC address displayed (e.g., `A4:CF:12:34:56:78`)

### Record Both MAC Addresses
- **Probe ESP32 MAC:** `__:__:__:__:__:__`
- **Gateway ESP32 MAC:** `__:__:__:__:__:__`

## Step 3: Configure Probe Firmware

Edit `firmware/probe/probe.ino` and set:

```cpp
// Line ~25: Set this to your Gateway's MAC address
uint8_t gatewayMac[] = {
  0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78  // ← REPLACE WITH YOUR GATEWAY MAC
};
```

Convert your Gateway MAC address to hex format:
- Example: `A4:CF:12:34:56:78` → `0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78`

## Step 4: Compile and Upload Firmware

### Using Arduino IDE

1. **Install ESP32 Board Support:**
   - Tools → Board Manager
   - Search "esp32"
   - Install "esp32 by Espressif Systems"

2. **Upload Probe Firmware:**
   - Open `firmware/probe/probe.ino`
   - Select: Tools → Board → ESP32 Dev Module
   - Select: Tools → Upload Speed → 921600
   - Select: Tools → Port → (your probe USB port)
   - Click Upload

3. **Upload Gateway Firmware:**
   - Open `firmware/gateway/gateway.ino`
   - Select: Tools → Board → ESP32 Dev Module
   - Select: Tools → Upload Speed → 921600
   - Select: Tools → Port → (your gateway USB port)
   - Click Upload

### Using PlatformIO

1. **Create platformio.ini:**

```ini
[env:probe]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
upload_port = COM5  ; Adjust to your Probe COM port
monitor_speed = 115200
lib_deps =
    ArduinoJson

[env:gateway]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
upload_port = COM6  ; Adjust to your Gateway COM port
monitor_speed = 115200
lib_deps =
    ArduinoJson
```

2. **Upload:**
   ```bash
   pio run -e probe --target upload
   pio run -e gateway --target upload
   ```

## Step 5: Verify Uploads

### Probe Verification
1. Open Serial Monitor at 115200 baud for Probe
2. Should see: `DEBUG: BhedanX Probe starting...`
3. Look for: `DEBUG: Probe initialized successfully`

### Gateway Verification
1. Open Serial Monitor at 115200 baud for Gateway
2. Should see: `{"type":"GATEWAY_STARTUP"...}`
3. Wait for probe packets (may take a few seconds)
4. Should see JSON telemetry: `{"probeId":"P-01",...}`

## Step 6: Find Serial Port Names

### Windows
1. Open Device Manager
2. Expand "Ports (COM & LPT)"
3. Note the COM ports (e.g., `COM5`, `COM6`)
4. Gateway port is the one receiving JSON data

### Linux
```bash
ls -la /dev/ttyUSB*
```
Ports typically named: `/dev/ttyUSB0`, `/dev/ttyUSB1`

### macOS
```bash
ls /dev/cu.usbserial*
```
Ports typically named: `/dev/cu.usbserial-xxxxxx`

## Step 7: Configure Environment Variables

Set your Gateway serial port for the Node.js backend:

### Windows (Command Prompt)
```cmd
set BHEDANX_SERIAL_PORT=COM5
set BHEDANX_DATA_SOURCE=REAL_HARDWARE
npm run dev
```

### Linux/macOS (Bash)
```bash
export BHEDANX_SERIAL_PORT=/dev/ttyUSB0
export BHEDANX_DATA_SOURCE=REAL_HARDWARE
npm run dev
```

## Step 8: Start the System

1. **Power on both ESP32 boards** (USB connected)
2. **Start the backend:**
   ```bash
   npm run dev
   ```
3. **Open the dashboard:**
   - Navigate to http://localhost:5173/
4. **Switch to Real Hardware Mode:**
   - Click "REAL HARDWARE" button in demo bar
5. **Monitor the Gateway Status panel:**
   - Should show: `STATUS: ONLINE`
   - `ESP-NOW: CONNECTED`
   - `PACKETS RECEIVED: > 0`

## Troubleshooting

### Problem: Gateway shows "OFFLINE"
- Check USB cable connection
- Verify serial port name in environment variables
- Check gateway is running (Serial Monitor shows JSON)
- Try replugging USB cable

### Problem: No packets received
- Verify Probe uploaded successfully (should show debug messages)
- Check Gateway MAC address is correct in probe.ino
- Verify both boards are powered and have USB connection
- Check RF environment (WiFi interference on 2.4GHz)

### Problem: Serial data garbled
- Verify baud rate is 115200 in Serial Monitor
- Check USB cable quality (some cheap cables are data-only)
- Try different USB port on computer

### Problem: Probe not detecting sensor
- Check piezo wired to GPIO34
- Verify ADC pin can be read (test with analogRead(34))
- Adjust NOISE_THRESHOLD in probe.ino if needed

## Next Steps

- [ESP-NOW Setup Guide](espnow-setup.md) - Configuration details
- [Serial Setup Guide](serial-setup.md) - Serial communication details
- [Testing Guide](testing.md) - Full system testing procedure
