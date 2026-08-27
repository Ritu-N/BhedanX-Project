import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize database
const db = new Database(path.join(__dirname, 'bhedanx.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS probes (
    id TEXT PRIMARY KEY,
    zone TEXT,
    sector TEXT,
    priorityScore INTEGER,
    status TEXT,
    signalQuality INTEGER,
    battery INTEGER,
    updatedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    probeId TEXT,
    timestamp INTEGER,
    vibration INTEGER,
    acoustic INTEGER,
    persistence INTEGER,
    signalQuality INTEGER,
    priorityScore INTEGER,
    status TEXT
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    probeId TEXT,
    severity TEXT,
    message TEXT,
    score INTEGER,
    acknowledged INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    startedAt INTEGER
  );
`);

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Global state for data source
let currentDataSource = process.env.BHEDANX_DATA_SOURCE || 'DEMO';
let gatewayStatus = {
  connected: false,
  status: 'OFFLINE',
  espnowStatus: 'WAITING',
  portName: null,
  packetsReceived: 0,
  lastPacketTime: null
};
let serialPort = null;
let serialParser = null;
const offlineTimeoutMs = () => Number(process.env.BHEDANX_OFFLINE_TIMEOUT || 10000);
const clamp = (value) => Math.max(0, Math.min(100, Number(value)));
const validStatuses = ['NORMAL', 'SUSPICIOUS', 'HIGH_PRIORITY', 'CRITICAL'];
const validateTelemetry = (telemetry) => {
  const required = ['probeId', 'timestamp', 'vibration', 'acoustic', 'persistence', 'signalQuality', 'priorityScore', 'status'];
  if (!telemetry || required.some((field) => telemetry[field] === undefined)) return false;
  if (typeof telemetry.probeId !== 'string' || !telemetry.probeId.trim()) return false;
  if (!validStatuses.includes(telemetry.status)) return false;
  return ['vibration', 'acoustic', 'persistence', 'signalQuality', 'priorityScore']
    .every((field) => Number.isFinite(Number(telemetry[field])) && clamp(telemetry[field]) === Number(telemetry[field]));
};

const createEventAlert = (probeId, severity, message, score) => {
  const latest = db.prepare('SELECT severity, message FROM alerts WHERE probeId=? ORDER BY timestamp DESC LIMIT 1').get(probeId);
  if (latest?.severity === severity && latest.message === message) return null;
  const timestamp = Date.now();
  const result = db.prepare('INSERT INTO alerts (timestamp, probeId, severity, message, score) VALUES (?, ?, ?, ?, ?)')
    .run(timestamp, probeId, severity, message, score);
  return { id: result.lastInsertRowid, timestamp, probeId, severity, message, score, acknowledged: 0 };
};

const persistTelemetry = (telemetry, source = 'REAL_HARDWARE') => {
  if (!validateTelemetry(telemetry)) return { ok: false, error: 'Invalid telemetry' };
  const previous = db.prepare('SELECT * FROM probes WHERE id=?').get(telemetry.probeId);
  const timestamp = Number(telemetry.timestamp) || Date.now();
  db.prepare('INSERT INTO telemetry (probeId, timestamp, vibration, acoustic, persistence, signalQuality, priorityScore, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(telemetry.probeId, timestamp, telemetry.vibration, telemetry.acoustic, telemetry.persistence, telemetry.signalQuality, telemetry.priorityScore, telemetry.status);
  db.prepare(`INSERT INTO probes (id, zone, sector, priorityScore, status, signalQuality, battery, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET priorityScore=excluded.priorityScore, status=excluded.status, signalQuality=excluded.signalQuality, battery=excluded.battery, updatedAt=excluded.updatedAt`)
    .run(telemetry.probeId, telemetry.zone || previous?.zone || 'Unknown', telemetry.sector || previous?.sector || 'Unknown', telemetry.priorityScore, telemetry.status, telemetry.signalQuality, telemetry.battery ?? previous?.battery ?? 0, Date.now());

  let alert = null;
  if (previous?.status !== telemetry.status) {
    if (telemetry.status === 'CRITICAL') alert = createEventAlert(telemetry.probeId, 'CRITICAL', 'Critical activity detected', telemetry.priorityScore);
    else if (telemetry.status === 'HIGH_PRIORITY') alert = createEventAlert(telemetry.probeId, 'HIGH_PRIORITY', 'High-priority activity detected', telemetry.priorityScore);
    else if (telemetry.status === 'SUSPICIOUS') alert = createEventAlert(telemetry.probeId, 'WARNING', 'Suspicious activity detected', telemetry.priorityScore);
    else if (previous?.status === 'OFFLINE') alert = createEventAlert(telemetry.probeId, 'INFO', 'Probe communication restored', telemetry.priorityScore);
  }
  return { ok: true, telemetry: { ...telemetry, timestamp }, alert, source };
};

const startSerial = () => {
  const portName = process.env.BHEDANX_SERIAL_PORT;
  if (!portName || serialPort) return;
  serialPort = new SerialPort({ path: portName, baudRate: 115200, autoOpen: false });
  serialParser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
  serialParser.on('data', (line) => {
    try {
      const packet = JSON.parse(line.trim());
      if (packet.type === 'GATEWAY_HEARTBEAT') {
        gatewayStatus.packetsReceived = packet.packetsReceived || gatewayStatus.packetsReceived;
        gatewayStatus.lastPacketTime = new Date().toISOString();
      } else if (packet.probeId && currentDataSource === 'REAL_HARDWARE') {
        const result = persistTelemetry(packet);
        if (result.ok) {
          gatewayStatus.packetsReceived += 1;
          gatewayStatus.lastPacketTime = new Date().toISOString();
        }
      }
    } catch (_) {
      // Ignore debug and malformed serial lines without interrupting the stream.
    }
  });
  serialPort.on('open', () => { gatewayStatus.connected = true; gatewayStatus.status = 'ONLINE'; gatewayStatus.espnowStatus = 'CONNECTED'; });
  serialPort.on('close', () => { gatewayStatus.connected = false; gatewayStatus.status = 'OFFLINE'; gatewayStatus.espnowStatus = 'WAITING'; });
  serialPort.on('error', () => { gatewayStatus.connected = false; gatewayStatus.status = 'OFFLINE'; });
  serialPort.open((error) => { if (error) gatewayStatus.status = 'OFFLINE'; });
};

const markOfflineProbes = () => {
  const cutoff = Date.now() - offlineTimeoutMs();
  db.prepare('SELECT * FROM probes WHERE updatedAt < ? AND status != ?').all(cutoff, 'OFFLINE').forEach((probe) => {
    db.prepare('UPDATE probes SET status=? WHERE id=?').run('OFFLINE', probe.id);
    createEventAlert(probe.id, 'WARNING', 'Probe offline', probe.priorityScore);
  });
};

// Fallback demo data
const fallback = [
  { id: 'P-01', zone: 'Zone A', sector: 'Sector 1', priorityScore: 22, status: 'NORMAL', signalQuality: 92, battery: 78 },
  { id: 'P-02', zone: 'Zone A', sector: 'Sector 2', priorityScore: 45, status: 'SUSPICIOUS', signalQuality: 86, battery: 76 },
  { id: 'P-03', zone: 'Zone A', sector: 'Sector 3', priorityScore: 92, status: 'CRITICAL', signalQuality: 91, battery: 78 },
  { id: 'P-04', zone: 'Zone B', sector: 'Sector 1', priorityScore: 68, status: 'HIGH_PRIORITY', signalQuality: 88, battery: 64 }
];

// ============================================================================
// API ENDPOINTS
// ============================================================================

// Get all probes
app.get('/api/probes', (_, res) => {
  const rows = db.prepare('SELECT * FROM probes').all();
  res.json(rows.length ? rows : fallback);
});

// Get single probe
app.get('/api/probes/:id', (req, res) => {
  const probe = db.prepare('SELECT * FROM probes WHERE id=?').get(req.params.id);
  res.json(probe || fallback.find(p => p.id === req.params.id) || { error: 'Probe not found' });
});

// Get probe telemetry history
app.get('/api/probes/:id/history', (req, res) => {
  const history = db.prepare('SELECT * FROM telemetry WHERE probeId=? ORDER BY timestamp DESC LIMIT 50').all(req.params.id);
  res.json(history.reverse());
});

// Get all alerts
app.get('/api/alerts', (_, res) => {
  const alerts = db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50').all();
  res.json(alerts);
});

// Get system status
app.get('/api/system', (_, res) => {
  res.json({
    name: 'BhedanX Rescue Command',
    gateway: 'BX-LOCAL-01',
    status: 'ONLINE',
    dataSource: currentDataSource,
    mode: currentDataSource === 'DEMO' ? 'SIMULATED' : 'REAL_HARDWARE',
    database: 'ONLINE',
    telemetry: currentDataSource === 'DEMO' || gatewayStatus.lastPacketTime ? 'LIVE' : 'WAITING'
  });
});

app.get('/api/diagnostics', (_, res) => {
  const lastPacketAge = gatewayStatus.lastPacketTime ? Date.now() - new Date(gatewayStatus.lastPacketTime).getTime() : null;
  res.json({
    frontend: 'ONLINE',
    backend: 'ONLINE',
    database: 'ONLINE',
    gateway: gatewayStatus.connected ? 'ONLINE' : 'OFFLINE',
    serial: gatewayStatus.connected ? 'CONNECTED' : 'DISCONNECTED',
    espnow: gatewayStatus.espnowStatus,
    lastPacketAge,
    packets: gatewayStatus.packetsReceived
  });
});

// Get gateway status
app.get('/api/gateway/status', (_, res) => {
  res.json(gatewayStatus);
});

// Set data source (DEMO or REAL_HARDWARE)
app.post('/api/gateway/data-source', (req, res) => {
  const { source } = req.body;
  
  if (!['DEMO', 'REAL_HARDWARE'].includes(source)) {
    return res.status(400).json({ error: 'Invalid source. Must be DEMO or REAL_HARDWARE' });
  }
  
  const oldSource = currentDataSource;
  currentDataSource = source;
  if (source === 'REAL_HARDWARE') startSerial();
  
  console.log(`[API] Data source changed: ${oldSource} → ${source}`);
  
  res.json({
    ok: true,
    oldSource,
    newSource: source,
    message: source === 'DEMO' ? 'Switched to demo mode' : 'Switched to real hardware mode'
  });
});

// Get current data source
app.get('/api/gateway/data-source', (_, res) => {
  res.json({
    source: currentDataSource,
    available: ['DEMO', 'REAL_HARDWARE'],
    serialPort: process.env.BHEDANX_SERIAL_PORT || 'Not configured'
  });
});

// Post telemetry (from demo or gateway)
app.post('/api/telemetry', (req, res) => {
  const result = persistTelemetry(req.body, currentDataSource);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// Acknowledge alert
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  db.prepare('UPDATE alerts SET acknowledged=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ============================================================================
// STATIC FILE SERVING
// ============================================================================

const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('/{*splat}', (_, res) => res.sendFile(path.join(dist, 'index.html')));

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.BHEDANX_PORT || 3001;
if (currentDataSource === 'REAL_HARDWARE') startSerial();
setInterval(markOfflineProbes, 2000);
app.listen(PORT, () => {
  console.log(`[Server] BhedanX API listening on http://localhost:${PORT}`);
  console.log(`[Server] Data source: ${currentDataSource}`);
  if (process.env.BHEDANX_SERIAL_PORT) {
    console.log(`[Server] Serial port configured: ${process.env.BHEDANX_SERIAL_PORT}`);
  }
});
