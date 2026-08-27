import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

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
    mode: currentDataSource === 'DEMO' ? 'SIMULATED' : 'REAL_HARDWARE'
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
  const t = req.body;
  
  if (!t?.probeId || [t.vibration, t.acoustic, t.persistence, t.signalQuality].some(v => typeof v !== 'number')) {
    return res.status(400).json({ error: 'Invalid telemetry' });
  }
  
  const score = t.priorityScore || 0;
  const status = t.status || 'NORMAL';
  
  db.prepare(`
    INSERT INTO telemetry (probeId, timestamp, vibration, acoustic, persistence, signalQuality, priorityScore, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    t.probeId,
    t.timestamp || Date.now(),
    t.vibration,
    t.acoustic,
    t.persistence,
    t.signalQuality,
    score,
    status
  );
  
  db.prepare(`
    INSERT INTO probes (id, zone, sector, priorityScore, status, signalQuality, battery, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      priorityScore=excluded.priorityScore,
      status=excluded.status,
      signalQuality=excluded.signalQuality,
      updatedAt=excluded.updatedAt
  `).run(
    t.probeId,
    t.zone || 'Unknown',
    t.sector || 'Unknown',
    score,
    status,
    t.signalQuality,
    t.battery || 0,
    Date.now()
  );
  
  // Generate alert if priority is high
  if (score >= 30) {
    db.prepare(`
      INSERT INTO alerts (timestamp, probeId, severity, message, score)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Date.now(),
      t.probeId,
      status,
      score >= 80 ? 'Potential survivor activity detected' : 'Investigation recommended',
      score
    );
  }
  
  res.json({ ok: true });
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
app.get('/*', (_, res) => res.sendFile(path.join(dist, 'index.html')));

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.BHEDANX_PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Server] BhedanX API listening on http://localhost:${PORT}`);
  console.log(`[Server] Data source: ${currentDataSource}`);
  if (process.env.BHEDANX_SERIAL_PORT) {
    console.log(`[Server] Serial port configured: ${process.env.BHEDANX_SERIAL_PORT}`);
  }
});
