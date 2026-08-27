/*
  BHEDANX — GATEWAY ESP32 NODE 2
  
  Purpose: Receive telemetry via ESP-NOW, output JSON via Serial USB
  Requires: ESP32 development board
  
  The gateway receives packets from probes via ESP-NOW and outputs clean
  JSON telemetry to the serial port for the Node.js backend to consume.
*/

#include <esp_now.h>
#include <WiFi.h>
#include <ArduinoJson.h>  // Requires ArduinoJson library

// ============================================================================
// CONFIGURATION
// ============================================================================

// GPIO Configuration
const int LED_PIN = 2;  // Built-in LED for receive indication

// Serial Configuration
const int SERIAL_BAUD = 115200;  // Serial baud rate
const int SERIAL_DEBUG = 1;      // 1 = debug enabled, 0 = disabled

// Gateway Status
const int GATEWAY_HEARTBEAT_INTERVAL = 5000;  // Heartbeat every 5 seconds

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Telemetry packet structure (must match probe structure)
typedef struct {
  char probeId[8];
  uint32_t timestamp;
  uint8_t vibration;
  uint8_t acoustic;
  uint8_t persistence;
  uint8_t signalQuality;
  uint8_t priorityScore;
  uint8_t status;
} TelemetryPacket;

// ============================================================================
// GLOBAL STATE
// ============================================================================

unsigned long lastHeartbeat = 0;
unsigned long packetCount = 0;
unsigned long lastPacketTime = 0;

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================

void initializeWiFi();
void initializeESPNow();
void onDataReceive(const uint8_t *mac_addr, const uint8_t *incomingData, int len);
void printTelemetryJSON(const TelemetryPacket *packet);
void sendHeartbeat();
const char* getStatusLabel(uint8_t status);

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1000);
  
  // Initialize GPIO
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Print startup message
  Serial.println("{\"type\":\"GATEWAY_STARTUP\",\"version\":\"1.0\",\"timestamp\":" + String(millis()) + "}");
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: BhedanX Gateway starting...");
  }
  
  // Initialize WiFi and ESP-NOW
  initializeWiFi();
  initializeESPNow();
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: Gateway initialized and listening for probes");
  }
}

// ============================================================================
// LOOP
// ============================================================================

void loop() {
  unsigned long currentTime = millis();
  
  // Send periodic heartbeat
  if (currentTime - lastHeartbeat >= GATEWAY_HEARTBEAT_INTERVAL) {
    lastHeartbeat = currentTime;
    sendHeartbeat();
  }
  
  delay(10);
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void initializeWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  
  if (SERIAL_DEBUG) {
    Serial.print("DEBUG: Gateway MAC address: ");
    Serial.println(WiFi.macAddress());
  }
}

void initializeESPNow() {
  if (esp_now_init() != ESP_OK) {
    if (SERIAL_DEBUG) {
      Serial.println("DEBUG: ESP-NOW initialization failed");
    }
    return;
  }
  
  // Register receive callback
  esp_now_register_recv_cb(onDataReceive);
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: ESP-NOW initialized in receiver mode");
  }
}

// ============================================================================
// RECEPTION & PARSING
// ============================================================================

void onDataReceive(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
  // Validate packet size
  if (len != sizeof(TelemetryPacket)) {
    if (SERIAL_DEBUG) {
      Serial.printf("DEBUG: Invalid packet size: %d (expected %d)\n", len, sizeof(TelemetryPacket));
    }
    return;
  }
  
  // Cast to telemetry packet
  TelemetryPacket *packet = (TelemetryPacket *)incomingData;
  
  // Flash LED on receive
  digitalWrite(LED_PIN, HIGH);
  delay(30);
  digitalWrite(LED_PIN, LOW);
  
  // Update statistics
  packetCount++;
  lastPacketTime = millis();
  
  // Output JSON telemetry
  printTelemetryJSON(packet);
}

void printTelemetryJSON(const TelemetryPacket *packet) {
  // Create JSON document
  StaticJsonDocument<256> doc;
  
  // Add telemetry fields
  doc["probeId"] = packet->probeId;
  doc["timestamp"] = packet->timestamp;
  doc["vibration"] = packet->vibration;
  doc["acoustic"] = packet->acoustic;
  doc["persistence"] = packet->persistence;
  doc["signalQuality"] = packet->signalQuality;
  doc["priorityScore"] = packet->priorityScore;
  doc["status"] = getStatusLabel(packet->status);
  
  // Serialize to Serial
  serializeJson(doc, Serial);
  Serial.println();  // Add newline after JSON
}

// ============================================================================
// STATUS FUNCTIONS
// ============================================================================

void sendHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["type"] = "GATEWAY_HEARTBEAT";
  doc["timestamp"] = millis();
  doc["packetsReceived"] = packetCount;
  doc["lastPacketTime"] = lastPacketTime;
  
  serializeJson(doc, Serial);
  Serial.println();
}

const char* getStatusLabel(uint8_t status) {
  switch (status) {
    case 0: return "NORMAL";
    case 1: return "SUSPICIOUS";
    case 2: return "HIGH_PRIORITY";
    case 3: return "CRITICAL";
    default: return "UNKNOWN";
  }
}
