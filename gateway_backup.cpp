#include <Arduino.h>
#include <esp_now.h>
#include <WiFi.h>
#include <WebServer.h>

#define GREEN_LED  25
#define YELLOW_LED 26
#define RED_LED    27
#define BUZZER_PIN 18

WebServer server(80);

typedef struct struct_message {
  int vibrationValue;
  bool radarDetected;
  int priorityScore;
} struct_message;

struct_message incomingData;

void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingDataPtr, int len) {

  if (len != sizeof(incomingData)) {
    Serial.println("[BhedanX] Invalid packet size");
    return;
  }

  memcpy(&incomingData, incomingDataPtr, sizeof(incomingData));

  Serial.printf(
    "[BhedanX] Score: %d | Vib: %d | Motion: %d\n",
    incomingData.priorityScore,
    incomingData.vibrationValue,
    incomingData.radarDetected
  );

  if (incomingData.priorityScore > 70) {

    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);

  } else if (incomingData.priorityScore > 30) {

    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, HIGH);
    digitalWrite(RED_LED, LOW);
    digitalWrite(BUZZER_PIN, LOW);

  } else {

    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);
    digitalWrite(BUZZER_PIN, LOW);
  }
}

void handleRoot() {

  String html =
    "<!DOCTYPE html>"
    "<html>"
    "<head>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<meta http-equiv='refresh' content='1'>"

    "<style>"
    "body{"
    "font-family:Arial,sans-serif;"
    "background:#0d1117;"
    "color:#fff;"
    "text-align:center;"
    "padding:20px;"
    "}"

    ".card{"
    "background:#161b22;"
    "border:1px solid #30363d;"
    "padding:20px;"
    "border-radius:12px;"
    "margin:15px auto;"
    "max-width:400px;"
    "}"

    ".score{"
    "font-size:52px;"
    "font-weight:bold;"
    "margin:10px 0;"
    "color:" +
    String(
      incomingData.priorityScore > 70
        ? "#ff4444"
        : incomingData.priorityScore > 30
          ? "#ffbb33"
          : "#00c851"
    ) +
    ";}"

    ".status{"
    "font-size:18px;"
    "font-weight:bold;"
    "padding:8px;"
    "border-radius:6px;"
    "background:" +
    String(
      incomingData.priorityScore > 70
        ? "#4a0e0e"
        : incomingData.priorityScore > 30
          ? "#4a3b0e"
          : "#0e3a1d"
    ) +
    ";}"

    "</style>"
    "</head>"

    "<body>"

    "<h1>BHEDANX</h1>"
    "<p style='color:#8b949e;'>"
    "Subsurface Survivor Detection System"
    "</p>"

    "<div class='card'>"
    "<h2>Priority Score</h2>"

    "<div class='score'>" +
    String(incomingData.priorityScore) +
    " / 100</div>"

    "<div class='status'>" +
    String(
      incomingData.priorityScore > 70
        ? "CRITICAL: SURVIVOR DETECTED"
        : incomingData.priorityScore > 30
          ? "WARNING: SEISMIC ACTIVITY"
          : "SYSTEM SECURE - SCANNING"
    ) +
    "</div>"

    "</div>"

    "<div class='card'>"
    "<h3>Probe Telemetry</h3>"

    "<p>Vibration Level: <b>" +
    String(incomingData.vibrationValue) +
    "</b></p>"

    "<p>Radar Motion: <b>" +
    String(incomingData.radarDetected ? "DETECTED" : "CLEAR") +
    "</b></p>"

    "</div>"

    "</body>"
    "</html>";

  server.send(200, "text/html", html);
}

void setup() {

  Serial.begin(115200);

  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(GREEN_LED, HIGH);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  WiFi.mode(WIFI_AP_STA);

  // Gateway Wi-Fi network
  // Channel MUST match the probe
  WiFi.softAP(
    "BhedanX_Gateway",
    "12345678",
    1
  );

  Serial.println();
  Serial.println("================================");
  Serial.println("       BHEDANX GATEWAY");
  Serial.println("================================");

  Serial.print("Gateway AP IP: ");
  Serial.println(WiFi.softAPIP());

  Serial.print("Gateway AP MAC: ");
  Serial.println(WiFi.softAPmacAddress());

  Serial.println("WiFi Channel: 1");

  if (esp_now_init() != ESP_OK) {

    Serial.println("[ERROR] ESP-NOW initialization failed");

    return;
  }

  esp_now_register_recv_cb(OnDataRecv);

  server.on("/", handleRoot);

  server.begin();

  Serial.println("Web server started");
  Serial.println("================================");
}

void loop() {

  server.handleClient();
}