/*
  BHEDANX — PROBE ESP32 NODE 1
  
  Purpose: Read piezo sensor, calculate priority score, send via ESP-NOW
  Requires: ESP32 development board + piezo sensor
  
  The probe reads an analog piezo signal, processes it to detect activity,
  calculates persistence, and transmits telemetry via ESP-NOW.
*/

#include <esp_now.h>
#include <WiFi.h>
#include <time.h>

// ============================================================================
// CONFIGURATION
// ============================================================================

// GPIO Configuration
const int PIEZO_PIN = 34;  // ADC pin for piezo sensor (ESP32 pin 34 = GPIO34)
const int LED_PIN = 2;     // Built-in LED for status indication

// Probe Identification
const char PROBE_ID[8] = "P-01";

// Gateway MAC Address (MUST be configured to match actual gateway MAC)
// Update this with the actual gateway MAC address
uint8_t gatewayMac[] = {
  0xA4, 0xCF, 0x12, 0x34, 0x56, 0x78  // PLACEHOLDER - Update with real gateway MAC
};

// Sensor Processing Configuration
const int NOISE_THRESHOLD = 200;        // Minimum ADC deviation to register as activity
const int BASELINE_SAMPLES = 100;       // Number of samples for baseline calculation
const int HISTORY_SIZE = 30;            // Number of samples to maintain for persistence calc
const int ACTIVITY_DECAY = 5;           // How much activity level decreases per cycle
const int MAX_ACTIVITY_LEVEL = 100;     // Maximum activity level before clamping

// Timing Configuration
const int SENSOR_SAMPLE_INTERVAL = 100;   // Sample every 100ms
const int TELEMETRY_SEND_INTERVAL = 1800; // Send telemetry every 1800ms (1.8 seconds)
const int SERIAL_DEBUG = 1;               // 1 = debug enabled, 0 = disabled

// ============================================================================
// DATA STRUCTURES
// ============================================================================

// Telemetry packet structure (matches gateway expectations)
typedef struct {
  char probeId[8];
  uint32_t timestamp;
  uint8_t vibration;       // 0-100: vibration level
  uint8_t acoustic;        // 0-100: acoustic level (0 in single-sensor mode)
  uint8_t persistence;     // 0-100: event persistence
  uint8_t signalQuality;   // 0-100: ESP-NOW signal quality
  uint8_t priorityScore;   // 0-100: calculated ARIA score
  uint8_t status;          // 0=NORMAL, 1=SUSPICIOUS, 2=HIGH_PRIORITY, 3=CRITICAL
} TelemetryPacket;

// ============================================================================
// GLOBAL STATE
// ============================================================================

TelemetryPacket telemetry = {0};
uint32_t baselineValue = 0;
uint32_t activityLevel = 0;           // Current activity accumulation
uint16_t sensorHistory[HISTORY_SIZE] = {0};  // For persistence calculation
uint8_t historyIndex = 0;

unsigned long lastSampleTime = 0;
unsigned long lastTelemetryTime = 0;
uint32_t packetCount = 0;

// ============================================================================
// FUNCTION PROTOTYPES
// ============================================================================

void initializePiezoSensor();
void initializeESPNow();
void calculateBaseline();
int readPiezoSensor();
void processSensorData(int rawValue);
uint8_t calculateVibrationLevel();
uint8_t calculatePersistence();
uint8_t calculateSignalQuality();
uint8_t calculatePriorityScore();
uint8_t getStatusFromScore(uint8_t score);
void sendTelemetry();
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status);

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: BhedanX Probe starting...");
  }
  
  // Initialize GPIO
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // Initialize piezo sensor
  initializePiezoSensor();
  
  // Calculate baseline
  calculateBaseline();
  
  // Initialize WiFi and ESP-NOW
  initializeESPNow();
  
  // Initialize telemetry packet
  strncpy(telemetry.probeId, PROBE_ID, sizeof(telemetry.probeId) - 1);
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: Probe initialized successfully");
  }
}

// ============================================================================
// LOOP
// ============================================================================

void loop() {
  unsigned long currentTime = millis();
  
  // Sample sensor at regular intervals
  if (currentTime - lastSampleTime >= SENSOR_SAMPLE_INTERVAL) {
    lastSampleTime = currentTime;
    
    int rawValue = readPiezoSensor();
    processSensorData(rawValue);
  }
  
  // Send telemetry at regular intervals
  if (currentTime - lastTelemetryTime >= TELEMETRY_SEND_INTERVAL) {
    lastTelemetryTime = currentTime;
    sendTelemetry();
  }
  
  delay(10);  // Small delay to prevent watchdog timeout
}

// ============================================================================
// INITIALIZATION FUNCTIONS
// ============================================================================

void initializePiezoSensor() {
  pinMode(PIEZO_PIN, INPUT);
  if (SERIAL_DEBUG) {
    Serial.printf("DEBUG: Piezo sensor initialized on GPIO %d\n", PIEZO_PIN);
  }
}

void initializeESPNow() {
  // Set WiFi mode
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  
  if (SERIAL_DEBUG) {
    Serial.print("DEBUG: Probe MAC address: ");
    Serial.println(WiFi.macAddress());
  }
  
  // Initialize ESP-NOW
  if (esp_now_init() != ESP_OK) {
    if (SERIAL_DEBUG) {
      Serial.println("DEBUG: ESP-NOW initialization failed");
    }
    return;
  }
  
  // Register send callback
  esp_now_register_send_cb(onDataSent);
  
  // Add gateway as peer
  esp_now_peer_info_t peerInfo = {0};
  memcpy(peerInfo.peer_addr, gatewayMac, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;
  
  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    if (SERIAL_DEBUG) {
      Serial.println("DEBUG: Failed to add gateway peer");
    }
    return;
  }
  
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: ESP-NOW initialized and gateway peer added");
  }
}

void calculateBaseline() {
  if (SERIAL_DEBUG) {
    Serial.println("DEBUG: Calculating baseline...");
  }
  
  uint32_t sum = 0;
  for (int i = 0; i < BASELINE_SAMPLES; i++) {
    sum += analogRead(PIEZO_PIN);
    delay(10);
  }
  
  baselineValue = sum / BASELINE_SAMPLES;
  
  if (SERIAL_DEBUG) {
    Serial.printf("DEBUG: Baseline calculated: %lu\n", baselineValue);
  }
}

// ============================================================================
// SENSOR PROCESSING FUNCTIONS
// ============================================================================

int readPiezoSensor() {
  return analogRead(PIEZO_PIN);
}

void processSensorData(int rawValue) {
  // Calculate deviation from baseline
  int deviation = abs(rawValue - (int)baselineValue);
  
  // Apply noise threshold
  if (deviation > NOISE_THRESHOLD) {
    // Convert deviation to activity (0-100 scale)
    // Assume max deviation is around 1000 ADC units
    int activity = min(100, (deviation * 100) / 1000);
    activityLevel = max(0, min(MAX_ACTIVITY_LEVEL, activityLevel + activity));
  }
  
  // Decay activity level over time
  activityLevel = max(0, (int)activityLevel - ACTIVITY_DECAY);
  
  // Store in history for persistence calculation
  sensorHistory[historyIndex] = rawValue;
  historyIndex = (historyIndex + 1) % HISTORY_SIZE;
}

uint8_t calculateVibrationLevel() {
  // Vibration is based on current activity level
  return (uint8_t)activityLevel;
}

uint8_t calculatePersistence() {
  // Persistence: how many samples in history show significant deviation from baseline
  int activeCount = 0;
  int samples = HISTORY_SIZE;
  
  for (int i = 0; i < samples; i++) {
    int deviation = abs(sensorHistory[i] - (int)baselineValue);
    if (deviation > NOISE_THRESHOLD) {
      activeCount++;
    }
  }
  
  // Convert to 0-100 percentage
  return (activeCount * 100) / samples;
}

uint8_t calculateSignalQuality() {
  // ESP-NOW signal quality: approximate based on RSSI
  // For now, assume good signal (90%)
  // In real implementation, this would use wifi_sta_config or similar
  return 90;
}

uint8_t calculatePriorityScore() {
  // ARIA Priority Score Formula
  // priorityScore = vibration * 0.40 + acoustic * 0.25 + persistence * 0.25 + signalQuality * 0.10
  
  uint8_t vibration = calculateVibrationLevel();
  uint8_t acoustic = 0;  // SINGLE_SENSOR_MODE - no acoustic data
  uint8_t persistence = calculatePersistence();
  uint8_t signalQuality = calculateSignalQuality();
  
  uint16_t score = (vibration * 40) + (acoustic * 25) + (persistence * 25) + (signalQuality * 10);
  score = score / 100;  // Divide by sum of weights to normalize
  
  return min(100, (uint8_t)score);
}

uint8_t getStatusFromScore(uint8_t score) {
  if (score < 30) return 0;        // NORMAL
  if (score < 60) return 1;        // SUSPICIOUS
  if (score < 80) return 2;        // HIGH_PRIORITY
  return 3;                        // CRITICAL
}

// ============================================================================
// TELEMETRY TRANSMISSION
// ============================================================================

void sendTelemetry() {
  // Update telemetry packet
  telemetry.timestamp = millis();
  telemetry.vibration = calculateVibrationLevel();
  telemetry.acoustic = 0;  // SINGLE_SENSOR_MODE
  telemetry.persistence = calculatePersistence();
  telemetry.signalQuality = calculateSignalQuality();
  telemetry.priorityScore = calculatePriorityScore();
  telemetry.status = getStatusFromScore(telemetry.priorityScore);
  
  // Send via ESP-NOW
  esp_err_t result = esp_now_send(
    gatewayMac,
    (uint8_t *) &telemetry,
    sizeof(telemetry)
  );
  
  if (result == ESP_OK) {
    packetCount++;
    digitalWrite(LED_PIN, HIGH);  // Flash LED on send
    delay(50);
    digitalWrite(LED_PIN, LOW);
    
    if (SERIAL_DEBUG) {
      Serial.printf(
        "DEBUG: Packet %lu sent - Vibration:%d Persistence:%d Priority:%d Status:%d\n",
        packetCount,
        telemetry.vibration,
        telemetry.persistence,
        telemetry.priorityScore,
        telemetry.status
      );
    }
  } else {
    if (SERIAL_DEBUG) {
      Serial.printf("DEBUG: ESP-NOW send failed: %d\n", result);
    }
  }
}

void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (SERIAL_DEBUG && status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("DEBUG: ESP-NOW delivery failed");
  }
}
