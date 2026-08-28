#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <esp_now.h>

WebServer server(80);

// ============================================================
// PHYSICAL LEDs
// ============================================================

#define GREEN_LED   25
#define YELLOW_LED  26
#define RED_LED     27


// ============================================================
// PROBE DATA
// This structure MUST match the probe structure exactly.
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


TelemetryPacket probeData = {};

bool probeConnected = false;

unsigned long lastPacketTime = 0;


// ============================================================
// CALCULATE PROBABILITY
// ============================================================

float calculateProbability() {

    float survivor =
        constrain(probeData.survivorConfidence, 0, 100) / 100.0;

    float environment =
        constrain(probeData.environmentalRisk, 0, 25) / 25.0;

    float structure =
        constrain(probeData.structuralRisk, 0, 10) / 10.0;

    float location =
        constrain(probeData.locationPriority, 0, 10) / 10.0;


    // Evidence weights
    float survivorContribution =
        survivor * 60.0;

    float environmentContribution =
        environment * 15.0;

    float structureContribution =
        structure * 10.0;

    float locationContribution =
        location * 15.0;


    float probability =
        survivorContribution +
        environmentContribution +
        structureContribution +
        locationContribution;


    // Manual SOS gives a strong additional priority signal.
    if (probeData.manualSOS) {
        probability += 15.0;
    }


    return constrain(probability, 0.0, 100.0);
}


// ============================================================
// UPDATE PHYSICAL LEDs
// ============================================================

String updateLEDs(float probability) {

    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);


    if (probability >= 70.0) {

        digitalWrite(RED_LED, HIGH);

        return "RED";
    }

    if (probability >= 40.0) {

        digitalWrite(YELLOW_LED, HIGH);

        return "YELLOW";
    }


    digitalWrite(GREEN_LED, HIGH);

    return "GREEN";
}


// ============================================================
// ESP-NOW RECEIVE
// ============================================================

void OnDataRecv(
    const uint8_t *mac,
    const uint8_t *incomingData,
    int len
) {

    if (len != sizeof(TelemetryPacket)) {

        Serial.printf(
            "Invalid packet size: %d\n",
            len
        );

        return;
    }


    memcpy(
        &probeData,
        incomingData,
        sizeof(TelemetryPacket)
    );


    probeConnected = true;

    lastPacketTime = millis();


    float probability =
        calculateProbability();

    String led =
        updateLEDs(probability);


    Serial.println();
    Serial.println("================================");
    Serial.println("       BHEDANX ENGINE");
    Serial.println("================================");

    Serial.printf(
        "Survivor       : %d\n",
        probeData.survivorConfidence
    );

    Serial.printf(
        "Environment    : %d\n",
        probeData.environmentalRisk
    );

    Serial.printf(
        "Structure      : %d\n",
        probeData.structuralRisk
    );

    Serial.printf(
        "Location       : %d\n",
        probeData.locationPriority
    );

    Serial.printf(
        "Button         : %s\n",
        probeData.manualSOS ? "PRESSED" : "RELEASED"
    );

    Serial.printf(
        "Probability    : %.1f%%\n",
        probability
    );

    Serial.printf(
        "LED            : %s\n",
        led.c_str()
    );

    Serial.println("================================");
}


// ============================================================
// JSON API
// ============================================================

void handleAPI() {

    float survivor =
        constrain(probeData.survivorConfidence, 0, 100) / 100.0;

    float environment =
        constrain(probeData.environmentalRisk, 0, 25) / 25.0;

    float structure =
        constrain(probeData.structuralRisk, 0, 10) / 10.0;

    float location =
        constrain(probeData.locationPriority, 0, 10) / 10.0;


    float survivorContribution =
        survivor * 60.0;

    float environmentContribution =
        environment * 15.0;

    float structureContribution =
        structure * 10.0;

    float locationContribution =
        location * 15.0;


    float probability =
        survivorContribution +
        environmentContribution +
        structureContribution +
        locationContribution;


    if (probeData.manualSOS) {
        probability += 15.0;
    }


    probability =
        constrain(probability, 0.0, 100.0);


    String led =
        updateLEDs(probability);


    String decision;


    if (probability >= 70.0) {

        decision = "RESCUE FIRST";

    }
    else if (probability >= 40.0) {

        decision = "INVESTIGATE";

    }
    else {

        decision = "MONITOR";
    }


    String json = "{";

    json += "\"connected\":";
    json += probeConnected ? "true" : "false";
    json += ",";

    json += "\"button\":";
    json += probeData.manualSOS ? "true" : "false";
    json += ",";


    json += "\"survivor\":";
    json += String(probeData.survivorConfidence);
    json += ",";

    json += "\"environment\":";
    json += String(probeData.environmentalRisk);
    json += ",";

    json += "\"structure\":";
    json += String(probeData.structuralRisk);
    json += ",";

    json += "\"location\":";
    json += String(probeData.locationPriority);
    json += ",";


    json += "\"survivorContribution\":";
    json += String(survivorContribution, 2);
    json += ",";

    json += "\"environmentContribution\":";
    json += String(environmentContribution, 2);
    json += ",";

    json += "\"structureContribution\":";
    json += String(structureContribution, 2);
    json += ",";

    json += "\"locationContribution\":";
    json += String(locationContribution, 2);
    json += ",";


    json += "\"probability\":";
    json += String(probability, 2);
    json += ",";

    json += "\"led\":\"";
    json += led;
    json += "\",";

    json += "\"decision\":\"";
    json += decision;
    json += "\"";

    json += "}";


    server.send(
        200,
        "application/json",
        json
    );
}


// ============================================================
// WEB PAGE
// ============================================================

const char PAGE[] PROGMEM = R"rawliteral(

<!DOCTYPE html>

<html>

<head>

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>BhedanX Probability Engine</title>

<style>

* {
    box-sizing:border-box;
}

body {

    margin:0;

    background:#080b10;

    color:#e6edf3;

    font-family:Arial,sans-serif;
}

.container {

    max-width:1100px;

    width:94%;

    margin:auto;

    padding:25px 0 50px;
}

h1 {

    text-align:center;

    margin-bottom:5px;
}

.subtitle {

    text-align:center;

    color:#8b949e;

    margin-bottom:30px;
}


/* =========================================================
   CARD
========================================================= */

.card {

    background:#11161d;

    border:1px solid #30363d;

    border-radius:14px;

    padding:22px;

    margin-bottom:16px;
}

.title {

    color:#8b949e;

    font-size:13px;

    letter-spacing:1.5px;

    margin-bottom:18px;

    text-transform:uppercase;
}


/* =========================================================
   INPUTS
========================================================= */

.inputs {

    display:grid;

    grid-template-columns:
        repeat(4,1fr);

    gap:12px;
}

.input {

    background:#0d1117;

    border:1px solid #30363d;

    border-radius:10px;

    padding:18px;

    text-align:center;
}

.inputName {

    color:#8b949e;

    font-size:12px;
}

.inputValue {

    font-size:30px;

    font-weight:bold;

    margin-top:8px;
}


/* =========================================================
   COMPARISON
========================================================= */

.compare {

    display:grid;

    grid-template-columns:
        repeat(4,1fr);

    gap:12px;
}

.factor {

    background:#0d1117;

    border:1px solid #30363d;

    border-radius:10px;

    padding:18px;
}

.factorName {

    font-weight:bold;

    margin-bottom:12px;
}

.formula {

    font-family:monospace;

    color:#8b949e;

    line-height:1.8;
}

.contribution {

    font-size:25px;

    font-weight:bold;

    margin-top:8px;
}


/* =========================================================
   PROBABILITY
========================================================= */

.probabilityBox {

    text-align:center;
}

.probability {

    font-size:75px;

    font-weight:bold;

    margin:5px;
}

.progress {

    width:100%;

    height:20px;

    background:#21262d;

    border-radius:20px;

    overflow:hidden;

    margin:20px 0;
}

.progressFill {

    height:100%;

    transition:width .7s ease;
}


/* =========================================================
   LEDS
========================================================= */

.leds {

    display:grid;

    grid-template-columns:
        repeat(3,1fr);

    gap:18px;
}

.ledCard {

    text-align:center;

    padding:20px;

    background:#0d1117;

    border:1px solid #30363d;

    border-radius:12px;
}

.led {

    width:65px;

    height:65px;

    border-radius:50%;

    background:#24292f;

    margin:0 auto 15px;

    transition:.4s;
}

.led.active.green {

    background:#00d26a;

    box-shadow:
        0 0 20px #00d26a,
        0 0 40px #00d26a;
}

.led.active.yellow {

    background:#ffc107;

    box-shadow:
        0 0 20px #ffc107,
        0 0 40px #ffc107;
}

.led.active.red {

    background:#ff3b30;

    box-shadow:
        0 0 20px #ff3b30,
        0 0 40px #ff3b30;
}

.status {

    color:#8b949e;

    font-size:13px;
}


/* =========================================================
   DECISION
========================================================= */

.decision {

    text-align:center;

    font-size:28px;

    font-weight:bold;

    margin-top:15px;
}


/* =========================================================
   FLOW
========================================================= */

.flow {

    text-align:center;

    font-family:monospace;

    font-size:16px;

    line-height:2.3;

    color:#c9d1d9;
}

.highlight {

    font-weight:bold;

}


/* =========================================================
   RESPONSIVE
========================================================= */

@media(max-width:700px) {

    .inputs,
    .compare {

        grid-template-columns:
            1fr 1fr;
    }

    .leds {

        grid-template-columns:
            1fr;
    }

    .probability {

        font-size:55px;
    }
}

</style>

</head>


<body>

<div class="container">


<h1>BHEDANX</h1>

<div class="subtitle">

Real-Time Probability Engine

</div>


<!-- =====================================================
     FLOW
====================================================== -->

<div class="card">

<div class="title">

How the engine works

</div>

<div class="flow">

Probe Evidence

<br>↓

Compare Evidence

<br>↓

Normalize Values

<br>↓

Apply Importance Weights

<br>↓

Calculate Probability

<br>↓

Predict Priority

</div>

</div>


<!-- =====================================================
     INPUT DATA
====================================================== -->

<div class="card">

<div class="title">

01 — Live Probe Evidence

</div>


<div class="inputs">


<div class="input">

<div class="inputName">
SURVIVOR
</div>

<div class="inputValue"
id="survivor">
--
</div>

</div>


<div class="input">

<div class="inputName">
ENVIRONMENT
</div>

<div class="inputValue"
id="environment">
--
</div>

</div>


<div class="input">

<div class="inputName">
STRUCTURE
</div>

<div class="inputValue"
id="structure">
--
</div>

</div>


<div class="input">

<div class="inputName">
LOCATION
</div>

<div class="inputValue"
id="location">
--
</div>

</div>


</div>


<div class="status"
style="margin-top:15px;text-align:center"
id="connection">

Waiting for probe...

</div>


</div>


<!-- =====================================================
     COMPARISON
====================================================== -->

<div class="card">

<div class="title">

02 — Compare & Weight Evidence

</div>


<div class="compare">


<div class="factor">

<div class="factorName">

Survivor — 60%

</div>

<div class="formula">

Value:

<span id="sValue">--</span>

<br>

Normalized:

<span id="sNorm">--</span>

<br>

× 60%

</div>

<div class="contribution">

<span id="sContribution">--</span>

</div>

</div>


<div class="factor">

<div class="factorName">

Environment — 15%

</div>

<div class="formula">

Value:

<span id="eValue">--</span>

<br>

Normalized:

<span id="eNorm">--</span>

<br>

× 15%

</div>

<div class="contribution">

<span id="eContribution">--</span>

</div>

</div>


<div class="factor">

<div class="factorName">

Structure — 10%

</div>

<div class="formula">

Value:

<span id="stValue">--</span>

<br>

Normalized:

<span id="stNorm">--</span>

<br>

× 10%

</div>

<div class="contribution">

<span id="stContribution">--</span>

</div>

</div>


<div class="factor">

<div class="factorName">

Location — 15%

</div>

<div class="formula">

Value:

<span id="lValue">--</span>

<br>

Normalized:

<span id="lNorm">--</span>

<br>

× 15%

</div>

<div class="contribution">

<span id="lContribution">--</span>

</div>

</div>


</div>

</div>


<!-- =====================================================
     CALCULATION
====================================================== -->

<div class="card">

<div class="title">

03 — Probability Calculation

</div>


<div class="formula"
style="
text-align:center;
font-size:19px;
">


<span id="calc1">--</span>

+

<span id="calc2">--</span>

+

<span id="calc3">--</span>

+

<span id="calc4">--</span>


<br>

=

<strong>

<span id="calculated">--</span>

</strong>


</div>

</div>


<!-- =====================================================
     FINAL
====================================================== -->

<div class="card probabilityBox">

<div class="title">

04 — Predicted Probability

</div>


<div class="probability">

<span id="probability">

--

</span>%

</div>


<div class="progress">

<div class="progressFill"
id="progress">

</div>

</div>


<div class="decision"
id="decision">

WAITING

</div>

</div>


<!-- =====================================================
     LED OUTPUT
====================================================== -->

<div class="card">

<div class="title">

05 — Priority Output

</div>


<div class="leds">


<div class="ledCard">

<div class="led green"
id="greenLed">

</div>

<h3>GREEN</h3>

<div class="status">

MONITOR

</div>

</div>


<div class="ledCard">

<div class="led yellow"
id="yellowLed">

</div>

<h3>YELLOW</h3>

<div class="status">

INVESTIGATE

</div>

</div>


<div class="ledCard">

<div class="led red"
id="redLed">

</div>

<h3>RED</h3>

<div class="status">

RESCUE FIRST

</div>

</div>


</div>

</div>


<!-- =====================================================
     THRESHOLDS
====================================================== -->

<div class="card">

<div class="title">

Decision Thresholds

</div>

<div class="flow">

<span class="highlight">
0–39%
</span>

→ 🟢 MONITOR

<br>

<span class="highlight">
40–69%
</span>

→ 🟡 INVESTIGATE

<br>

<span class="highlight">
70–100%
</span>

→ 🔴 RESCUE FIRST

</div>

</div>


</div>


<script>


function set(id,value) {

    document.getElementById(id)
        .textContent = value;

}


function update(data) {


    // ======================================================
    // LIVE INPUT
    // ======================================================

    set(
        "survivor",
        data.survivor
    );

    set(
        "environment",
        data.environment
    );

    set(
        "structure",
        data.structure
    );

    set(
        "location",
        data.location
    );


    // ======================================================
    // NORMALIZATION
    // ======================================================

    let s =
        data.survivor / 100;

    let e =
        data.environment / 25;

    let st =
        data.structure / 10;

    let l =
        data.location / 10;


    set(
        "sValue",
        data.survivor
    );

    set(
        "eValue",
        data.environment
    );

    set(
        "stValue",
        data.structure
    );

    set(
        "lValue",
        data.location
    );


    set(
        "sNorm",
        s.toFixed(2)
    );

    set(
        "eNorm",
        e.toFixed(2)
    );

    set(
        "stNorm",
        st.toFixed(2)
    );

    set(
        "lNorm",
        l.toFixed(2)
    );


    // ======================================================
    // CONTRIBUTIONS
    // ======================================================

    set(
        "sContribution",
        data.survivorContribution.toFixed(2)
    );

    set(
        "eContribution",
        data.environmentContribution.toFixed(2)
    );

    set(
        "stContribution",
        data.structureContribution.toFixed(2)
    );

    set(
        "lContribution",
        data.locationContribution.toFixed(2)
    );


    // ======================================================
    // EQUATION
    // ======================================================

    set(
        "calc1",
        data.survivorContribution.toFixed(2)
    );

    set(
        "calc2",
        data.environmentContribution.toFixed(2)
    );

    set(
        "calc3",
        data.structureContribution.toFixed(2)
    );

    set(
        "calc4",
        data.locationContribution.toFixed(2)
    );

    set(
        "calculated",
        data.probability.toFixed(2)
    );


    // ======================================================
    // FINAL PROBABILITY
    // ======================================================

    set(
        "probability",
        data.probability.toFixed(1)
    );


    document
        .getElementById("progress")
        .style.width =
            data.probability + "%";


    // ======================================================
    // DECISION
    // ======================================================

    set(
        "decision",
        data.decision
    );


    // ======================================================
    // LED DISPLAY
    // ======================================================

    let green =
        document.getElementById("greenLed");

    let yellow =
        document.getElementById("yellowLed");

    let red =
        document.getElementById("redLed");


    green.classList.remove("active");

    yellow.classList.remove("active");

    red.classList.remove("active");


    if (data.led === "GREEN") {

        green.classList.add("active");

    }

    else if (data.led === "YELLOW") {

        yellow.classList.add("active");

    }

    else if (data.led === "RED") {

        red.classList.add("active");
    }


    // ======================================================
    // CONNECTION
    // ======================================================

    if (data.connected) {

        set(
            "connection",
            "● LIVE — PROBE CONNECTED"
        );

    }

    else {

        set(
            "connection",
            "○ WAITING FOR PROBE"
        );
    }

}


async function refresh() {

    try {

        const response =
            await fetch(
                "/api"
            );

        const data =
            await response.json();

        update(data);

    }

    catch(error) {

        set(
            "connection",
            "○ CONNECTION LOST"
        );

    }

}


setInterval(
    refresh,
    1000
);


refresh();

</script>

</body>

</html>

)rawliteral";


// ============================================================
// SETUP
// ============================================================

void setup() {

    Serial.begin(115200);

    delay(500);


    // ========================================================
    // LED SETUP
    // ========================================================

    pinMode(
        GREEN_LED,
        OUTPUT
    );

    pinMode(
        YELLOW_LED,
        OUTPUT
    );

    pinMode(
        RED_LED,
        OUTPUT
    );


    digitalWrite(
        GREEN_LED,
        LOW
    );

    digitalWrite(
        YELLOW_LED,
        LOW
    );

    digitalWrite(
        RED_LED,
        LOW
    );


    // ========================================================
    // WIFI
    // ========================================================

    WiFi.mode(
        WIFI_AP_STA
    );


    WiFi.softAP(
        "BhedanX_Gateway",
        "12345678",
        1
    );


    // ========================================================
    // ESP-NOW
    // ========================================================

    if (
        esp_now_init() != ESP_OK
    ) {

        Serial.println(
            "ESP-NOW initialization failed!"
        );

        return;
    }


    esp_now_register_recv_cb(
        OnDataRecv
    );


    // ========================================================
    // WEB SERVER
    // ========================================================

    server.on(
        "/",
        []() {

            server.send_P(
                200,
                "text/html",
                PAGE
            );

        }
    );


    server.on(
        "/api",
        handleAPI
    );


    server.begin();


    // ========================================================
    // START MESSAGE
    // ========================================================

    Serial.println();

    Serial.println(
        "================================"
    );

    Serial.println(
        "       BHEDANX GATEWAY"
    );

    Serial.println(
        "================================"
    );

    Serial.print(
        "Gateway IP: "
    );

    Serial.println(
        WiFi.softAPIP()
    );

    Serial.println(
        "Probability engine: READY"
    );

    Serial.println(
        "LED output: READY"
    );

    Serial.println(
        "================================"
    );
}


// ============================================================
// LOOP
// ============================================================

void loop() {

    server.handleClient();


    // If probe disappears for >6 seconds,
    // return to safe green/monitor state.

    if (
        probeConnected &&
        millis() - lastPacketTime > 6000
    ) {

        probeConnected = false;

        digitalWrite(
            GREEN_LED,
            HIGH
        );

        digitalWrite(
            YELLOW_LED,
            LOW
        );

        digitalWrite(
            RED_LED,
            LOW
        );
    }


    delay(5);
}