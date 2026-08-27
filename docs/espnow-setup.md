# BhedanX Stage 3 - ESP-NOW Configuration Guide

## What is ESP-NOW?

ESP-NOW is a protocol that allows ESP32 boards to communicate wirelessly with each other without WiFi networks. It's low-power, low-latency, and perfect for mesh networking.

- **Range:** ~250 meters in open space
- **Latency:** <1ms
- **Power usage:** Very low (mA range)
- **Frequency:** 2.4 GHz (same as WiFi, but doesn't require connection)

## Architecture

```
Probe ESP32 (Sender)
    ↓
  ESP-NOW packet (binary structure)
    ↓
Gateway ESP32 (Receiver)
    ↓
  Serial USB output (JSON)
    ↓
Node.js Backend
    ↓
React Dashboard
```

## Packet Structure

The telemetry packet sent via ESP-NOW has this structure:

```cpp
struct TelemetryPacket {
  char probeId[8];           // Probe identifier (e.g., "P-01")
  uint32_t timestamp;         // Milliseconds since boot
  uint8_t vibration;          // 0-100: vibration level
  uint8_t acoustic;           // 0-100: acoustic level (0 in single-sensor mode)
  uint8_t persistence;        // 0-100: event persistence
  uint8_t signalQuality;      // 0-100: signal quality
  uint8_t priorityScore;      // 0-100: calculated ARIA score
  uint8_t status;             // 0=NORMAL, 1=SUSPICIOUS, 2=HIGH_PRIORITY, 3=CRITICAL
};
```

**Total size:** 22 bytes (very compact for reliable transmission)

## Probe Configuration

### MAC Address Configuration

Edit `firmware/probe/probe.ino`:

```cpp
// Line ~25: MUST MATCH your Gateway's actual MAC address
uint8_t gatewayMac[] = {
  0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78  // CHANGE THIS
};
```

**How to find your Gateway MAC:**
1. Upload serial print sketch to Gateway
2. Run it and read Serial Monitor
3. Convert hex format: `A4:CF:12:34:56:78` → `{0xA4, 0xCF, 0x12, ...}`

### Sensor Configuration

**Piezo Sensor Pin:**
```cpp
const int PIEZO_PIN = 34;  // GPIO34 (ADC pin on ESP32)
```

**Noise Threshold:**
```cpp
const int NOISE_THRESHOLD = 200;  // Adjust if too sensitive/insensitive
```

- Higher value = less sensitive (fewer false positives)
- Lower value = more sensitive (may detect vibration/noise)

### Tuning Parameters

```cpp
const int BASELINE_SAMPLES = 100;      // Number of samples for baseline
const int HISTORY_SIZE = 30;           // Samples stored for persistence calc
const int ACTIVITY_DECAY = 5;          // How quickly activity decreases
const int SENSOR_SAMPLE_INTERVAL = 100; // Sample interval (ms)
const int TELEMETRY_SEND_INTERVAL = 1800; // Send every 1.8 seconds
```

## Gateway Configuration

The Gateway automatically listens for packets from any probe on the network.

### Expected Serial Output Format

**Telemetry packet:**
```json
{"probeId":"P-01","timestamp":12345,"vibration":82,"acoustic":0,"persistence":75,"signalQuality":90,"priorityScore":76,"status":"HIGH_PRIORITY"}
```

**Heartbeat packet (every 5 seconds):**
```json
{"type":"GATEWAY_HEARTBEAT","timestamp":12345,"packetsReceived":127,"lastPacketTime":12340}
```

**Startup message:**
```json
{"type":"GATEWAY_STARTUP","version":"1.0","timestamp":12345}
```

### Debug Output

Debug messages are prefixed with `DEBUG:` and only shown if enabled on the probe.

Example:
```
DEBUG: Piezo sensor initialized on GPIO 34
DEBUG: Baseline calculated: 1024
DEBUG: Packet 1 sent - Vibration:82 Persistence:75 Priority:76 Status:2
```

## ESP-NOW Troubleshooting

### Problem: "No packets received"
1. Verify Gateway MAC in probe.ino matches actual MAC
2. Check both boards are powered
3. Try moving boards closer together
4. Restart both boards
5. Check Serial Monitor on Gateway (should show JSON)

### Problem: "Occasional packet loss"
- Normal for wireless communication
- ESP-NOW retries automatically
- Acceptable loss rate: <5% packets

### Problem: "High latency or delays"
- Reduce SENSOR_SAMPLE_INTERVAL (currently 100ms)
- Reduce TELEMETRY_SEND_INTERVAL (currently 1800ms)
- Check for nearby WiFi/Bluetooth interference

### Problem: "Probe not sending packets"
Check Gateway Serial Monitor:
- Should see debug messages if enabled
- If no messages: probe firmware may not have uploaded
- Retry upload with different USB cable

## Adding More Probes

To add additional probes to the same gateway:

1. **Duplicate probe.ino** for each new probe
2. **Change the PROBE_ID:**
   ```cpp
   const char PROBE_ID[8] = "P-02";  // Different for each probe
   ```
3. **Use the SAME gateway MAC** for all probes
4. **Upload to each probe board**
5. **Select different probe in dashboard**

The gateway will receive telemetry from all probes and identify them by probeId.

## Performance Metrics

### Bandwidth
- Packet size: 22 bytes
- Send interval: 1800ms
- Throughput: ~122 bytes/second per probe
- Support for 8+ simultaneous probes

### Power Consumption (Probe)
- Active transmission: ~80mA
- Sleep between transmissions: ~10mA
- Average (at 1.8s interval): ~15mA
- Battery life (2000mAh): ~130+ hours

### Latency
- Packet transmission: <1ms
- Serial output: <10ms
- Dashboard update: <50ms
- **Total system latency: <100ms**

## Security Considerations

Current implementation:
- **No encryption** (suitable for rescue operations, local only)
- **No authentication** (assumes local network only)

For production deployments:
- Add encryption key if needed
- Implement MAC filtering on gateway
- Consider changing channel if interference detected

### Changing ESP-NOW Channel

Edit gateway.ino:
```cpp
// In initializeESPNow() function
peerInfo.channel = 1;  // Try 1-13 if interference occurs
```

Probe must use same channel in initializeESPNow().

## Reference Documentation

- [ESP-NOW Official Docs](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/network/esp_now.html)
- [ESP32 Hardware Reference](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/hw-reference/esp32_devkitc.html)
