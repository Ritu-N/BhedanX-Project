#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// ============================================================
// BHEDANX PROBE
// ============================================================

#define BUTTON_PIN 13

// Gateway MAC
// Your gateway reported:
// 8C:94:DF:93:C1:09
uint8_t gatewayMAC[] = {
    0x8C, 0x94, 0xDF, 0x93, 0xC1, 0x09
};


// ============================================================
// DATA PACKET
// MUST MATCH GATEWAY
// ============================================================

typedef struct {

    uint32_t packetID;

    char probeID[8];

    bool manualSOS;

    float temperature;
    float humidity;
    float pressure;
    float oxygen;

    int co2;
    int voc;

    float batteryVoltage;
    int batteryPercent;

    float depth;

    int rssi;
    float packetLoss;

    int survivorConfidence;
    int environmentalRisk;
    int structuralRisk;
    int locationPriority;

    int priorityScore;

} TelemetryPacket;


TelemetryPacket dataPacket;


// ============================================================
// VARIABLES
// ============================================================

unsigned long lastSend = 0;

uint32_t packetCounter = 0;


// ============================================================
// ESP-NOW SEND CALLBACK
// ============================================================

void OnDataSent(
    const uint8_t *mac_addr,
    esp_now_send_status_t status
) {

    if (status == ESP_NOW_SEND_SUCCESS) {

        Serial.println(
            "ESP-NOW: SENT"
        );

    } else {

        Serial.println(
            "ESP-NOW: FAILED"
        );
    }
}


// ============================================================
// GENERATE SIMULATED TELEMETRY
// ============================================================

void generateTelemetry() {

    // --------------------------------------------------------
    // Environmental telemetry
    // --------------------------------------------------------

    dataPacket.temperature =
        random(260, 360) / 10.0;

    dataPacket.humidity =
        random(550, 850) / 10.0;

    dataPacket.pressure =
        random(970, 1020);

    dataPacket.oxygen =
        random(190, 211) / 10.0;

    dataPacket.co2 =
        random(450, 1800);

    dataPacket.voc =
        random(50, 500);


    // --------------------------------------------------------
    // Probe telemetry
    // --------------------------------------------------------

    dataPacket.batteryVoltage =
        random(365, 420) / 100.0;

    dataPacket.batteryPercent =
        random(72, 96);

    dataPacket.depth =
        random(20, 140) / 10.0;


    // --------------------------------------------------------
    // Network telemetry
    // --------------------------------------------------------

    dataPacket.rssi =
        random(-72, -45);

    dataPacket.packetLoss =
        random(0, 15) / 10.0;


    // --------------------------------------------------------
    // Environmental risk
    // --------------------------------------------------------

    dataPacket.environmentalRisk =
        random(0, 26);


    // --------------------------------------------------------
    // Structural risk
    // --------------------------------------------------------

    dataPacket.structuralRisk =
        random(0, 11);


    // --------------------------------------------------------
    // Location priority
    // --------------------------------------------------------

    dataPacket.locationPriority =
        random(2, 11);


    // --------------------------------------------------------
    // PUSH BUTTON
    //
    // INPUT_PULLUP:
    //
    // RELEASED = HIGH
    // PRESSED  = LOW
    // --------------------------------------------------------

    bool buttonPressed =
        digitalRead(BUTTON_PIN) == LOW;


    dataPacket.manualSOS =
        buttonPressed;


    // --------------------------------------------------------
    // SURVIVOR CONFIDENCE
    // --------------------------------------------------------

    if (buttonPressed) {

        // Physical button represents
        // strong survivor evidence.

        dataPacket.survivorConfidence =
            random(90, 101);

    } else {

        // No physical survivor signal.

        dataPacket.survivorConfidence =
            random(5, 26);
    }


    // --------------------------------------------------------
    // PRIORITY ENGINE
    // --------------------------------------------------------

    int score = 0;


    // Survivor evidence = 60%

    score +=
        dataPacket.survivorConfidence
        * 0.60;


    // Environmental risk = 15%

    score +=
        (dataPacket.environmentalRisk / 25.0)
        * 15;


    // Structural risk = 10%

    score +=
        (dataPacket.structuralRisk / 10.0)
        * 10;


    // Location = 15%

    score +=
        (dataPacket.locationPriority / 10.0)
        * 15;


    // --------------------------------------------------------
    // EMERGENCY OVERRIDE
    // --------------------------------------------------------

    if (buttonPressed) {

        score =
            random(90, 101);
    }


    dataPacket.priorityScore =
        constrain(
            score,
            0,
            100
        );
}


// ============================================================
// SEND TELEMETRY
// ============================================================

void sendTelemetry() {

    dataPacket.packetID =
        ++packetCounter;


    esp_err_t result =
        esp_now_send(
            gatewayMAC,
            (uint8_t *)&dataPacket,
            sizeof(dataPacket)
        );


    // --------------------------------------------------------
    // SERIAL OUTPUT
    // --------------------------------------------------------

    Serial.println();

    Serial.println(
        "================================"
    );

    Serial.println(
        "       BHEDANX PROBE"
    );

    Serial.println(
        "================================"
    );


    Serial.printf(
        "Packet ID       : %lu\n",
        dataPacket.packetID
    );


    Serial.printf(
        "Probe ID        : %s\n",
        dataPacket.probeID
    );


    Serial.printf(
        "Button          : %s\n",
        dataPacket.manualSOS
        ? "PRESSED"
        : "RELEASED"
    );


    Serial.printf(
        "Temperature     : %.1f C\n",
        dataPacket.temperature
    );


    Serial.printf(
        "Humidity        : %.1f %%\n",
        dataPacket.humidity
    );


    Serial.printf(
        "Pressure        : %.0f hPa\n",
        dataPacket.pressure
    );


    Serial.printf(
        "Oxygen          : %.1f %%\n",
        dataPacket.oxygen
    );


    Serial.printf(
        "CO2             : %d ppm\n",
        dataPacket.co2
    );


    Serial.printf(
        "VOC             : %d\n",
        dataPacket.voc
    );


    Serial.printf(
        "Battery         : %d %%\n",
        dataPacket.batteryPercent
    );


    Serial.printf(
        "Depth           : %.1f m\n",
        dataPacket.depth
    );


    Serial.printf(
        "Survivor        : %d/100\n",
        dataPacket.survivorConfidence
    );


    Serial.printf(
        "Environment     : %d/25\n",
        dataPacket.environmentalRisk
    );


    Serial.printf(
        "Structure       : %d/10\n",
        dataPacket.structuralRisk
    );


    Serial.printf(
        "Location        : %d/10\n",
        dataPacket.locationPriority
    );


    Serial.printf(
        "Priority Score  : %d/100\n",
        dataPacket.priorityScore
    );


    if (
        dataPacket.priorityScore >= 70
    ) {

        Serial.println(
            "DECISION        : RED / RESCUE FIRST"
        );

    }

    else if (
        dataPacket.priorityScore >= 40
    ) {

        Serial.println(
            "DECISION        : YELLOW / INVESTIGATE"
        );

    }

    else {

        Serial.println(
            "DECISION        : GREEN / MONITOR"
        );
    }


    if (
        result == ESP_OK
    ) {

        Serial.println(
            "Transmission    : SENT"
        );

    } else {

        Serial.printf(
            "Transmission    : ERROR %d\n",
            result
        );
    }


    Serial.println(
        "================================"
    );
}


// ============================================================
// SETUP
// ============================================================

void setup() {

    Serial.begin(115200);

    delay(1000);


    // --------------------------------------------------------
    // BUTTON
    // --------------------------------------------------------

    pinMode(
        BUTTON_PIN,
        INPUT_PULLUP
    );


    // --------------------------------------------------------
    // RANDOM SEED
    // --------------------------------------------------------

    randomSeed(
        analogRead(34)
    );


    // --------------------------------------------------------
    // WIFI
    // --------------------------------------------------------

    WiFi.mode(
        WIFI_STA
    );


    // Gateway is using channel 1

    esp_wifi_set_channel(
        1,
        WIFI_SECOND_CHAN_NONE
    );


    // --------------------------------------------------------
    // ESP-NOW
    // --------------------------------------------------------

    if (
        esp_now_init()
        != ESP_OK
    ) {

        Serial.println(
            "ESP-NOW INIT FAILED"
        );

        return;
    }


    esp_now_register_send_cb(
        OnDataSent
    );


    // --------------------------------------------------------
    // ADD GATEWAY
    // --------------------------------------------------------

    esp_now_peer_info_t peerInfo = {};

    memcpy(
        peerInfo.peer_addr,
        gatewayMAC,
        6
    );

    peerInfo.channel = 1;

    peerInfo.encrypt = false;


    if (
        esp_now_add_peer(
            &peerInfo
        )
        != ESP_OK
    ) {

        Serial.println(
            "FAILED TO ADD GATEWAY"
        );

        return;
    }


    // --------------------------------------------------------
    // PROBE ID
    // --------------------------------------------------------

    strcpy(
        dataPacket.probeID,
        "BX-P01"
    );


    Serial.println();

    Serial.println(
        "================================"
    );

    Serial.println(
        "       BHEDANX PROBE"
    );

    Serial.println(
        "================================"
    );

    Serial.println(
        "Probe ready."
    );

    Serial.println(
        "Button: D13 -> GND"
    );

    Serial.println(
        "Released = normal"
    );

    Serial.println(
        "Pressed  = survivor detected"
    );

    Serial.println(
        "================================"
    );
}


// ============================================================
// LOOP
// ============================================================

void loop() {

    if (
        millis() - lastSend >= 2000
    ) {

        lastSend =
            millis();

        generateTelemetry();

        sendTelemetry();
    }


    delay(10);
}