import { useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, Battery, ChevronRight, CircleStop, Crosshair, Gauge, MapPin, Radio, RefreshCw, Shield, Siren, Wifi, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { initialProbes, enrichProbe } from './data/probes';
import { stepProbe } from './services/telemetryService';
import { getPriorityStatus, statusLabel, statusTone } from './utils/scoring';
import { api } from './services/api';
import L from 'leaflet';

const now = () => new Date().toLocaleTimeString([], { hour12: false });
const seededHistory = (probe) => Array.from({ length: 14 }, (_, index) => ({ 
  time: `${index + 1}m`, 
  vibration: Math.max(0, probe.vibration + Math.round(Math.sin(index) * 8)), 
  acoustic: Math.max(0, probe.acoustic + Math.round(Math.cos(index) * 7)), 
  priority: probe.priorityScore 
}));

function Badge({ status }) { 
  return <span className={`badge ${statusTone[status] || 'normal'}`}><span />{statusLabel[status] || status}</span>; 
}

function Stat({ icon: Icon, label, value, tone = '' }) { 
  return <div className="stat"><div className={`stat-icon ${tone}`}><Icon size={18} /></div><div><small>{label}</small><strong>{value}</strong></div></div>; 
}

function Bar({ label, value, color = 'cyan' }) { 
  return <div className="evidence-row"><span>{label}</span><div className="bar"><i style={{ width: `${value}%`, background: `var(--${color})` }} /></div><b>{value}%</b></div>; 
}

function SiteMap({ probes, selected, onSelect }) {
  const points = [[18,42],[33,26],[48,54],[61,31],[70,67],[84,42],[42,78],[78,20]];
  const mapRef = useRef(null);
  useEffect(() => { 
    const map = L.map(mapRef.current, { 
      attributionControl: false, 
      zoomControl: false, 
      crs: L.CRS.Simple, 
      minZoom: -2, 
      maxZoom: 2 
    }).setView([0, 0], 0); 
    return () => map.remove(); 
  }, []);
  return <div className="map" ref={mapRef}>
    <div className="map-grid" />
    <div className="map-label site-a">ZONE A</div>
    <div className="map-label site-b">ZONE B</div>
    <div className="gateway"><Radio size={16} /><span>GATEWAY</span></div>
    {probes.map((probe, index) => <button 
      key={probe.id} 
      className={`map-pin ${statusTone[probe.status]} ${selected === probe.id ? 'selected' : ''}`} 
      style={{ left: `${points[index][0]}%`, top: `${points[index][1]}%` }} 
      onClick={() => onSelect(probe.id)} 
      title={`${probe.id}: ${probe.priorityScore}`}
    ><span>{probe.id}</span></button>)}
  </div>;
}

function App() {
  const [probes, setProbes] = useState(initialProbes.map((probe) => ({ 
    ...enrichProbe(probe), 
    history: seededHistory(probe),
    prevStatus: null 
  })));
  const [selectedId, setSelectedId] = useState('P-03');
  const [running, setRunning] = useState(true);
  const [page, setPage] = useState('Dashboard');
  const [event, setEvent] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [prevProbes, setPrevProbes] = useState(probes);
  const [dataSource, setDataSource] = useState('DEMO');
  const [gatewayStatus, setGatewayStatus] = useState({
    connected: false,
    status: 'OFFLINE',
    espnowStatus: 'WAITING',
    portName: null,
    packetsReceived: 0,
    lastPacketTime: null
  });
  const [diagnostics, setDiagnostics] = useState(null);
  const [settings, setSettings] = useState({ offlineTimeout: 10000, criticalThreshold: 80, highThreshold: 60, suspiciousThreshold: 30 });
  const demoTimers = useRef([]);

  const selected = probes.find((probe) => probe.id === selectedId) || probes[0];
  const highCount = probes.filter((probe) => probe.priorityScore >= 60).length;
  const averageSignal = Math.round(probes.reduce((sum, probe) => sum + probe.signalQuality, 0) / probes.length);

  // Generate alerts only when status changes
  const generateAlerts = (newProbes, oldProbes) => {
    newProbes.forEach((newProbe) => {
      const oldProbe = oldProbes.find((p) => p.id === newProbe.id);
      if (!oldProbe) return;

      // Alert when status changes TO critical/high
      if (newProbe.status !== oldProbe.status) {
        if (newProbe.status === 'CRITICAL') {
          setAlerts((items) => [{
            id: Date.now() + Math.random(),
            time: now(),
            probeId: newProbe.id,
            severity: 'CRITICAL',
            message: 'Critical activity detected',
            score: newProbe.priorityScore,
            acknowledged: false
          }, ...items].slice(0, 12));
        } else if (newProbe.status === 'HIGH_PRIORITY') {
          setAlerts((items) => [{
            id: Date.now() + Math.random(),
            time: now(),
            probeId: newProbe.id,
            severity: 'HIGH_PRIORITY',
            message: 'High-priority activity detected',
            score: newProbe.priorityScore,
            acknowledged: false
          }, ...items].slice(0, 12));
        }
      }

      // Alert when battery low
      if (oldProbe.battery > 20 && newProbe.battery <= 20) {
        setAlerts((items) => [{
          id: Date.now() + Math.random(),
          time: now(),
          probeId: newProbe.id,
          severity: 'WARNING',
          message: 'Low battery detected',
          score: newProbe.battery,
          acknowledged: false
        }, ...items].slice(0, 12));
      }

      // Alert when communication becomes weak
      if (oldProbe.communication === 'GOOD' && newProbe.communication === 'WEAK') {
        setAlerts((items) => [{
          id: Date.now() + Math.random(),
          time: now(),
          probeId: newProbe.id,
          severity: 'WARNING',
          message: 'Weak signal detected',
          score: newProbe.signalQuality,
          acknowledged: false
        }, ...items].slice(0, 12));
      }

      // Alert when probe goes offline
      if (oldProbe.online && !newProbe.online) {
        setAlerts((items) => [{
          id: Date.now() + Math.random(),
          time: now(),
          probeId: newProbe.id,
          severity: 'WARNING',
          message: 'Probe offline',
          score: 0,
          acknowledged: false
        }, ...items].slice(0, 12));
      }
    });
  };

  const update = () => {
    if (dataSource !== 'DEMO') return;
    setProbes((current) => {
      const next = current.map((probe) => {
        const stepped = stepProbe(probe, probe.id === selectedId ? event : null);
        const enriched = enrichProbe(stepped);
        return {
          ...enriched,
          history: [...probe.history.slice(-29), {
            time: now(),
            vibration: enriched.vibration,
            acoustic: enriched.acoustic,
            priority: enriched.priorityScore
          }]
        };
      });

      // Generate alerts for state changes
      generateAlerts(next, current);
      setPrevProbes(next);
      return next;
    });
  };

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(update, 1800);
    return () => clearInterval(timer);
  }, [running, event, selectedId, dataSource]);

  useEffect(() => {
    if (dataSource !== 'REAL_HARDWARE') return undefined;
    const syncHardware = async () => {
      try {
        const [probeRows, alertRows, diagnosticRows] = await Promise.all([
          api.probes(), api.alerts(), fetch('/api/diagnostics').then((response) => response.json())
        ]);
        const nextProbes = await Promise.all(probeRows.map(async (probe) => ({
          ...probe,
          online: probe.status !== 'OFFLINE',
          battery: null,
          acousticConnected: false,
          communication: diagnostics?.espnow === 'CONNECTED' ? 'CONNECTED' : 'WAITING',
          history: (await api.history(probe.id)).map((row) => ({ ...row, time: new Date(row.timestamp).toLocaleTimeString([], { hour12: false }) }))
        })));
        setProbes(nextProbes.map((probe) => ({ ...probe, status: probe.status || 'NORMAL' })));
        setAlerts(alertRows.map((alert) => ({ ...alert, time: new Date(alert.timestamp).toLocaleTimeString([], { hour12: false }) })));
        setDiagnostics(diagnosticRows);
      } catch (_) {
        setDiagnostics(null);
      }
    };
    syncHardware();
    const interval = setInterval(syncHardware, 1800);
    return () => clearInterval(interval);
  }, [dataSource]);

  useEffect(() => {
    api.probes().catch(() => {});
  }, []);

  // Fetch gateway status and data source
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const systemRes = await fetch('http://localhost:3001/api/system');
        const system = await systemRes.json();
        if (system.dataSource) {
          setDataSource(system.dataSource);
        }
        
        const gatewayRes = await fetch('http://localhost:3001/api/gateway/status');
        const gateway = await gatewayRes.json();
        setGatewayStatus(gateway);
      } catch (err) {
        // Silent fail - use defaults
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Handle data source switching
  const switchDataSource = async (source) => {
    try {
      const res = await fetch('http://localhost:3001/api/gateway/data-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source })
      });
      const data = await res.json();
      if (data.ok) {
        setDataSource(source);
        setRunning(source === 'DEMO');
      }
    } catch (err) {
      console.error('Failed to switch data source:', err);
    }
  };

  const trigger = (type) => {
    if (type === 'offline') {
      setProbes((items) =>
        items.map((probe) =>
          probe.id === selectedId
            ? enrichProbe({ ...probe, online: false })
            : probe
        )
      );
    } else if (type === 'recover') {
      setProbes((items) =>
        items.map((probe) =>
          probe.id === selectedId
            ? enrichProbe({ ...probe, online: true })
            : probe
        )
      );
    } else {
      setEvent(type);
      update();
      setTimeout(() => setEvent(null), 8000);
    }
  };

  const runFullDemo = () => {
    demoTimers.current.forEach(clearTimeout);
    setDataSource('DEMO');
    setRunning(true);
    setSelectedId('P-01');
    demoTimers.current = [
      setTimeout(() => setEvent('tap'), 500),
      setTimeout(() => setEvent('high'), 9000),
      setTimeout(() => setEvent('high'), 18000),
      setTimeout(() => setEvent('high'), 27000),
      setTimeout(() => setEvent(null), 35000)
    ];
  };

  const resetDemo = () => {
    demoTimers.current.forEach(clearTimeout);
    setEvent(null);
    setRunning(false);
    setAlerts([]);
    setProbes(initialProbes.map((probe) => ({ ...enrichProbe(probe), history: seededHistory(probe) })));
  };

  const acknowledge = (id) =>
    setAlerts((items) =>
      items.map((alert) =>
        alert.id === id ? { ...alert, acknowledged: true } : alert
      )
    );

  const navItems = ['Dashboard', 'Probes', 'Live Map', 'Alerts', 'Analytics', 'Reports', 'Settings'];

  return (
    <div className="app-shell">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <Crosshair size={22} />
          </div>
          <div>
            <strong>BHEDAN<span>X</span></strong>
            <small>RESCUE COMMAND</small>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button
              className={page === item ? 'active' : ''}
              key={item}
              onClick={() => setPage(item)}
            >
              {item === 'Dashboard' ? (
                <Gauge size={17} />
              ) : item === 'Live Map' ? (
                <MapPin size={17} />
              ) : item === 'Alerts' ? (
                <Siren size={17} />
              ) : item === 'Probes' ? (
                <Radio size={17} />
              ) : (
                <Activity size={17} />
              )}
              {item}
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="online-dot" />
          SYSTEM ONLINE
          <small>Local gateway · BX-LOCAL-01</small>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">
              INTEGRATED SUBSURFACE DISASTER-RECOVERY & LIFE-DETECTION SYSTEM
            </p>
            <h1>{page}</h1>
          </div>
          <div className="header-actions">
            <div className="system-status">
              <span className="pulse" />
              SYSTEM ONLINE
            </div>
            <div className="clock">{now()}</div>
          </div>
        </header>

        {page === 'Dashboard' && (
          <>
            <section className="stats">
              <Stat
                icon={Radio}
                label="TOTAL PROBES"
                value={String(probes.length).padStart(2, '0')}
              />
              <Stat
                icon={Siren}
                label="HIGH-PRIORITY EVENTS"
                value={String(highCount).padStart(2, '0')}
                tone="orange"
              />
              <Stat
                icon={Zap}
                label="HIGHEST PRIORITY"
                value={`${Math.max(...probes.map((probe) => probe.priorityScore))} — ${
                  probes.find((p) => p.priorityScore === Math.max(...probes.map((probe) => probe.priorityScore)))?.id || 'N/A'
                }`}
                tone="red"
              />
              <Stat
                icon={Wifi}
                label="AVG SIGNAL QUALITY"
                value={`${averageSignal}%`}
                tone="green"
              />
            </section>

            <div className="demo-bar">
              <div>
                <span className="demo-live" /> {dataSource === 'DEMO' ? (running ? 'DEMO MODE' : 'DEMO STOPPED') : 'REAL HARDWARE'} <small>{dataSource === 'DEMO' ? 'SIMULATED SENSOR DATA' : 'GATEWAY TELEMETRY'}</small>
              </div>
              {dataSource === 'DEMO' && <button onClick={() => setRunning(!running)}>
                {running ? <CircleStop size={15} /> : <Zap size={15} />}
                {running ? 'STOP DEMO' : 'START DEMO'}
              </button>}
              {dataSource === 'DEMO' && <button
                onClick={resetDemo}
              >
                <RefreshCw size={15} /> RESET
              </button>}
              {dataSource === 'DEMO' && <button onClick={runFullDemo}><Zap size={15} /> RUN FULL DEMO</button>}

              {/* Data Source Toggle */}
              <div className="data-source-toggle">
                <button
                  className={dataSource === 'DEMO' ? 'active' : ''}
                  onClick={() => switchDataSource('DEMO')}
                  title="Switch to demo mode"
                >
                  DEMO
                </button>
                <button
                  className={dataSource === 'REAL_HARDWARE' ? 'active' : ''}
                  onClick={() => switchDataSource('REAL_HARDWARE')}
                  title="Switch to real hardware mode"
                >
                  REAL HARDWARE
                </button>
              </div>

              {/* Gateway Status */}
              <div className={`gateway-indicator ${gatewayStatus.connected ? 'connected' : 'disconnected'}`} title={`Gateway: ${gatewayStatus.status}`}>
                <span className={`gateway-dot ${gatewayStatus.connected ? 'online' : 'offline'}`} />
                GATEWAY: {gatewayStatus.status}
              </div>

              <div className="event-buttons">
                <button onClick={() => trigger('tap')}>SIMULATE TAPPING</button>
                <button onClick={() => trigger('high')}>SIMULATE HIGH ACTIVITY</button>
                <button onClick={() => trigger('acoustic')}>SIMULATE ACOUSTIC EVENT</button>
                <button onClick={() => trigger('normal')}>SIMULATE NORMAL</button>
                <button onClick={() => trigger('offline')}>SIMULATE PROBE OFFLINE</button>
                {!selected.online && (
                  <button onClick={() => trigger('recover')} className="recover-btn">
                    SIMULATE PROBE ONLINE
                  </button>
                )}
              </div>
            </div>

            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-title">
                  <h2>SELECTED PROBE</h2>
                  <span>{selected.id}</span>
                </div>
                <div className="probe-info">
                  <div className="probe-status">
                    <Badge status={selected.status} />
                    <div>
                      <p>{selected.id}</p>
                      <small>
                        {selected.zone} / {selected.sector}
                      </small>
                    </div>
                  </div>
                  {selected.online ? (
                    <>
                      <div className="info-grid">
                        <Bar label="VIBRATION" value={selected.vibration} color="red" />
                        <Bar label="ACOUSTIC" value={selected.acoustic} color="orange" />
                        <Bar label="PERSISTENCE" value={selected.persistence} color="yellow" />
                        <Bar label="SIGNAL QUALITY" value={selected.signalQuality} color="cyan" />
                        <div className="evidence-row">
                          <span>PRIORITY SCORE</span>
                          <b>{selected.priorityScore} / 100</b>
                        </div>
                        <div className="evidence-row">
                          <span>COMMUNICATION</span>
                          <b>{selected.communication}</b>
                        </div>
                        <div className="evidence-row">
                          <span>BATTERY</span>
                          <b>{dataSource === 'DEMO' ? `${selected.battery}%` : 'N/A'}</b>
                        </div>
                        <div className="evidence-row">
                          <span>LAST UPDATE</span>
                          <b>LIVE</b>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="offline-info">
                      <p>PROBE OFFLINE</p>
                      <small>Last priority: {selected.priorityScore}</small>
                      <small>Battery: {selected.battery}%</small>
                    </div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-title">
                  <h2>GATEWAY STATUS</h2>
                  <span>{gatewayStatus.status}</span>
                </div>
                <div className="gateway-info">
                  <div className="info-grid">
                    <div className="evidence-row">
                      <span>STATUS</span>
                      <b className={gatewayStatus.connected ? 'green' : 'offline'}>{gatewayStatus.status}</b>
                    </div>
                    <div className="evidence-row">
                      <span>ESP-NOW</span>
                      <b>{gatewayStatus.espnowStatus}</b>
                    </div>
                    <div className="evidence-row">
                      <span>SERIAL PORT</span>
                      <b>{gatewayStatus.portName || 'Not configured'}</b>
                    </div>
                    <div className="evidence-row">
                      <span>PACKETS RECEIVED</span>
                      <b>{gatewayStatus.packetsReceived || 0}</b>
                    </div>
                    <div className="evidence-row">
                      <span>LAST PACKET</span>
                      <b>
                        {gatewayStatus.lastPacketTime
                          ? new Date(gatewayStatus.lastPacketTime).toLocaleTimeString([], { hour12: false })
                          : 'N/A'}
                      </b>
                    </div>
                    <div className="evidence-row">
                      <span>DATA SOURCE</span>
                      <b>{dataSource}</b>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-title">
                  <h2>ARIA SIGNAL ANALYSIS</h2>
                  <span>LIVE TELEMETRY</span>
                </div>
                {selected.history.length > 0 && (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={selected.history.slice(-30)}>
                      <defs>
                        <linearGradient id="vibGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--red)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="acGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--orange)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--orange)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="prGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--cyan)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="var(--cyan)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                      <YAxis stroke="rgba(255,255,255,0.5)" />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="vibration"
                        stroke="var(--red)"
                        fillOpacity={1}
                        fill="url(#vibGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="acoustic"
                        stroke="var(--orange)"
                        fillOpacity={1}
                        fill="url(#acGrad)"
                      />
                      <Area
                        type="monotone"
                        dataKey="priority"
                        stroke="var(--cyan)"
                        fillOpacity={1}
                        fill="url(#prGrad)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </section>

              <section className="panel">
                <div className="panel-title">
                  <h2>RECENT ALERTS</h2>
                  <span>{alerts.length} TOTAL</span>
                </div>
                <div className="alerts-mini">
                  {alerts.length > 0 ? (
                    alerts.slice(0, 5).map((alert) => (
                      <div
                        className={`alert-row ${alert.acknowledged ? 'acknowledged' : ''}`}
                        key={alert.id}
                      >
                        <div className={`alert-icon ${statusTone[alert.severity]}`}>
                          <AlertTriangle size={12} />
                        </div>
                        <div>
                          <strong>{alert.probeId}</strong>
                          <span>{alert.time}</span>
                        </div>
                        {!alert.acknowledged && (
                          <button
                            className="btn-tiny"
                            onClick={() => acknowledge(alert.id)}
                          >
                            ACK
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      No recent alerts. System nominal.
                    </div>
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-title"><h2>SYSTEM DIAGNOSTICS</h2><span>{diagnostics ? 'LIVE' : 'LOCAL'}</span></div>
                <div className="gateway-info">
                  {['frontend', 'backend', 'database', 'gateway', 'serial', 'espnow'].map((key) => <div className="evidence-row" key={key}><span>{key.toUpperCase()}</span><b className={diagnostics?.[key] === 'OFFLINE' || diagnostics?.[key] === 'DISCONNECTED' ? 'offline' : 'green'}>{diagnostics?.[key] || (dataSource === 'DEMO' ? 'ONLINE' : 'WAITING')}</b></div>)}
                  <div className="evidence-row"><span>PACKETS</span><b>{diagnostics?.packets || gatewayStatus.packetsReceived || 0}</b></div>
                </div>
              </section>
            </div>
          </>
        )}

        {page === 'Probes' && (
          <PageView
            page={page}
            probes={probes}
            alerts={alerts}
            selected={selected}
            onSelect={setSelectedId}
            acknowledge={acknowledge}
          />
        )}

        {page === 'Live Map' && (
          <PageView
            page={page}
            probes={probes}
            alerts={alerts}
            selected={selected}
            onSelect={setSelectedId}
            acknowledge={acknowledge}
          />
        )}

        {page === 'Alerts' && (
          <PageView
            page={page}
            probes={probes}
            alerts={alerts}
            selected={selected}
            onSelect={setSelectedId}
            acknowledge={acknowledge}
          />
        )}

        {page === 'Analytics' && (
          <PageView
            page={page}
            probes={probes}
            alerts={alerts}
            selected={selected}
            onSelect={setSelectedId}
            acknowledge={acknowledge}
          />
        )}

        {page === 'Reports' && <ReportView probes={probes} alerts={alerts} dataSource={dataSource} />}
        {page === 'Settings' && <SettingsView settings={settings} setSettings={setSettings} dataSource={dataSource} onSourceChange={switchDataSource} />}
      </main>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, action }) {
  return (
    <div className="panel-title">
      <div>
        <Icon size={15} />
        <h2>{title}</h2>
      </div>
      <span>{action}</span>
    </div>
  );
}

function ReportView({ probes, alerts, dataSource }) {
  const highest = probes.reduce((winner, probe) => probe.priorityScore > (winner?.priorityScore || -1) ? probe : winner, null);
  const rows = [['Mission ID', 'BX-001'], ['Data source', dataSource], ['Total probes', probes.length], ['Highest priority probe', highest?.id || 'N/A'], ['Highest priority score', highest?.priorityScore ?? 'N/A'], ['Critical events', alerts.filter((alert) => alert.severity === 'CRITICAL').length], ['High priority events', alerts.filter((alert) => alert.severity === 'HIGH_PRIORITY').length], ['Warnings', alerts.filter((alert) => alert.severity === 'WARNING').length], ['Average signal quality', probes.length ? `${Math.round(probes.reduce((sum, probe) => sum + probe.signalQuality, 0) / probes.length)}%` : 'N/A']];
  const exportCsv = () => { const csv = rows.map(([label, value]) => `${label},${value}`).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'bhedanx-mission-report.csv'; link.click(); URL.revokeObjectURL(link.href); };
  return <div className="page-panel panel report"><h2>BHEDANX MISSION REPORT</h2><div className="report-grid">{rows.map(([label, value]) => <Stat key={label} icon={Activity} label={label.toUpperCase()} value={String(value)} />)}</div><button className="primary" onClick={() => window.print()}>PRINT REPORT</button><button className="secondary" onClick={exportCsv}>EXPORT CSV</button></div>;
}

function SettingsView({ settings, setSettings, dataSource, onSourceChange }) {
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: Math.max(1, Number(value) || 1) }));
  return <div className="page-panel panel settings"><div className="panel-title"><h2>SYSTEM SETTINGS</h2><span>LOCAL CONFIGURATION</span></div><div className="setting"><span>DATA SOURCE</span><span><button className="toggle" onClick={() => onSourceChange('DEMO')}>DEMO</button> <button className="toggle" onClick={() => onSourceChange('REAL_HARDWARE')}>REAL HARDWARE</button></span></div>{[['offlineTimeout', 'OFFLINE TIMEOUT (MS)'], ['criticalThreshold', 'CRITICAL THRESHOLD'], ['highThreshold', 'HIGH PRIORITY THRESHOLD'], ['suspiciousThreshold', 'SUSPICIOUS THRESHOLD']].map(([key, label]) => <label className="setting" key={key}><span>{label}</span><input type="number" min="1" max="100000" value={settings[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div>;
}

function PageView({
  page,
  probes,
  alerts,
  selected,
  onSelect,
  acknowledge
}) {
  if (page === 'Live Map') {
    return (
      <div className="page-panel panel">
        <PanelTitle
          icon={MapPin}
          title="LIVE RESCUE MAP"
          action="LOCAL SITE GRID"
        />
        <SiteMap probes={probes} selected={selected.id} onSelect={onSelect} />
      </div>
    );
  }

  if (page === 'Alerts') {
    return (
      <div className="page-panel panel">
        <PanelTitle
          icon={Siren}
          title="ALERT LOG"
          action="ACKNOWLEDGE REQUIRED"
        />
        {alerts.length ? (
          alerts.map((alert) => (
            <div className="alert-row large" key={alert.id}>
              <div className={`alert-icon ${statusTone[alert.severity]}`}>
                <AlertTriangle size={15} />
              </div>
              <div>
                <strong>
                  {alert.probeId} · {alert.message}
                </strong>
                <span>
                  {alert.time} · Priority {alert.score} · {alert.severity}
                </span>
              </div>
              {!alert.acknowledged && (
                <button onClick={() => acknowledge(alert.id)}>
                  ACKNOWLEDGE
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty">
            No active alerts. All nodes are being monitored.
          </div>
        )}
      </div>
    );
  }

  if (page === 'Probes') {
    return (
      <div className="page-panel panel">
        <PanelTitle
          icon={Radio}
          title="PROBE MANAGEMENT"
          action="8 REGISTERED NODES"
        />
        {probes.map((probe) => (
          <div
            className="management-row"
            key={probe.id}
            onClick={() => onSelect(probe.id)}
          >
            <strong>{probe.id}</strong>
            <span>
              {probe.zone} / {probe.sector}
            </span>
            <Badge status={probe.status} />
            <b>{probe.priorityScore}</b>
            <span>
              {probe.signalQuality}% signal · {probe.battery}% battery
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (page === 'Analytics') {
    return (
      <div className="page-panel panel">
        <PanelTitle
          icon={Activity}
          title="ANALYTICS"
          action="LIVE TELEMETRY"
        />
        <div className="report-grid">
          <Stat
            icon={Zap}
            label="MEAN PRIORITY"
            value={`${Math.round(
              probes.reduce((sum, probe) => sum + probe.priorityScore, 0) /
                probes.length
            )}`}
          />
          <Stat
            icon={Activity}
            label="ACTIVE SIGNALS"
            value={String(
              probes.filter((probe) => probe.vibration > 50).length
            ).padStart(2, '0')}
          />
          <Stat
            icon={Siren}
            label="ALERTS"
            value={String(alerts.length).padStart(2, '0')}
          />
        </div>
        <div className="analytics-list">
          {probes.map((probe) => (
            <button
              className="analytics-item"
              key={probe.id}
              onClick={() => onSelect(probe.id)}
            >
              <strong>{probe.id}</strong>
              <span className={statusTone[probe.status]}>
                {statusLabel[probe.status]}
              </span>
              <b>{probe.priorityScore}</b>
              <small>{probe.communication}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export default App;
