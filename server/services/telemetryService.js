/**
 * BhedanX Telemetry Service
 * 
 * Manages both DEMO and REAL HARDWARE data sources
 * Routes telemetry from either simulated or actual ESP32 gateway
 * Maintains gateway status and probe health
 */

const SerialService = require('./serialService');

class TelemetryService {
  constructor(options = {}) {
    this.dataSource = options.dataSource || process.env.BHEDANX_DATA_SOURCE || 'DEMO';
    this.probeStates = new Map();  // Track latest state for each probe
    this.alertHistory = [];
    this.maxAlerts = 12;
    this.gatewayStatus = {
      connected: false,
      status: 'OFFLINE',
      lastPacketTime: null,
      packetsReceived: 0,
      portName: null,
      espnowStatus: 'WAITING'
    };
    
    this.listeners = [];
    this.serialService = null;
    
    // Initialize serial service if real hardware mode
    if (this.dataSource === 'REAL_HARDWARE') {
      this.initializeSerialService();
    }
  }
  
  /**
   * Initialize serial service for real hardware mode
   */
  initializeSerialService() {
    this.serialService = new SerialService({
      port: process.env.BHEDANX_SERIAL_PORT,
      baudRate: 115200,
      autoOpen: true,
      maxReconnectAttempts: 999
    });
    
    // Handle telemetry from gateway
    this.serialService.on('telemetry', (telemetry) => {
      this.handleRealTelemetry(telemetry);
    });
    
    // Handle gateway status
    this.serialService.on('connected', () => {
      this.gatewayStatus.connected = true;
      this.gatewayStatus.status = 'ONLINE';
      this.gatewayStatus.espnowStatus = 'CONNECTED';
      this.notifyListeners('gateway-connected');
      console.log('[TelemetryService] Gateway connected');
    });
    
    this.serialService.on('disconnected', () => {
      this.gatewayStatus.connected = false;
      this.gatewayStatus.status = 'OFFLINE';
      this.gatewayStatus.espnowStatus = 'WAITING';
      this.notifyListeners('gateway-disconnected');
      console.log('[TelemetryService] Gateway disconnected');
    });
    
    this.serialService.on('gateway-startup', (data) => {
      console.log('[TelemetryService] Gateway startup:', data);
    });
    
    this.serialService.on('gateway-heartbeat', (data) => {
      this.gatewayStatus.packetsReceived = data.packetsReceived || 0;
      this.gatewayStatus.lastPacketTime = new Date(data.timestamp);
    });
    
    this.serialService.on('error', (err) => {
      console.error('[TelemetryService] Serial error:', err.message);
    });
  }
  
  /**
   * Handle telemetry from real hardware
   */
  handleRealTelemetry(telemetry) {
    // Validate telemetry
    const errors = SerialService.validateTelemetry(telemetry);
    if (errors.length > 0) {
      console.error('[TelemetryService] Invalid telemetry:', errors, telemetry);
      return;
    }
    
    // Store probe state
    this.probeStates.set(telemetry.probeId, {
      ...telemetry,
      lastUpdate: new Date(),
      source: 'REAL_HARDWARE',
      online: true
    });
    
    // Notify listeners
    this.notifyListeners('telemetry', telemetry);
  }
  
  /**
   * Handle telemetry from demo mode
   */
  handleDemoTelemetry(probes) {
    for (const probe of probes) {
      this.probeStates.set(probe.probeId, {
        probeId: probe.probeId,
        timestamp: probe.lastUpdate,
        vibration: probe.vibration,
        acoustic: probe.acoustic,
        persistence: probe.persistence,
        signalQuality: probe.signalQuality,
        priorityScore: probe.priorityScore,
        status: probe.status,
        lastUpdate: new Date(),
        source: 'DEMO',
        online: probe.online,
        battery: probe.battery,
        communication: probe.communication
      });
    }
  }
  
  /**
   * Subscribe to telemetry events
   */
  subscribe(callback) {
    this.listeners.push(callback);
  }
  
  /**
   * Unsubscribe from telemetry events
   */
  unsubscribe(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }
  
  /**
   * Notify all listeners
   */
  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (err) {
        console.error('[TelemetryService] Listener error:', err.message);
      }
    });
  }
  
  /**
   * Set data source (DEMO or REAL_HARDWARE)
   */
  setDataSource(source) {
    if (source !== 'DEMO' && source !== 'REAL_HARDWARE') {
      throw new Error('Invalid data source. Must be DEMO or REAL_HARDWARE');
    }
    
    const oldSource = this.dataSource;
    this.dataSource = source;
    
    if (oldSource !== source) {
      if (source === 'REAL_HARDWARE' && !this.serialService) {
        this.initializeSerialService();
      }
      this.notifyListeners('data-source-changed', { source });
      console.log(`[TelemetryService] Data source changed: ${oldSource} → ${source}`);
    }
  }
  
  /**
   * Get gateway status
   */
  getGatewayStatus() {
    if (this.serialService) {
      const serialStatus = this.serialService.getStatus();
      return {
        connected: serialStatus.connected,
        status: serialStatus.connected ? 'ONLINE' : 'OFFLINE',
        espnowStatus: serialStatus.connected ? 'CONNECTED' : 'WAITING',
        portName: this.serialService.config.port,
        packetsReceived: serialStatus.packetCount,
        lastPacketTime: serialStatus.lastPacketTime,
        isReconnecting: serialStatus.isReconnecting
      };
    }
    return this.gatewayStatus;
  }
  
  /**
   * Get current data source
   */
  getDataSource() {
    return this.dataSource;
  }
  
  /**
   * Get probe states
   */
  getProbeStates() {
    return Array.from(this.probeStates.values());
  }
  
  /**
   * Get single probe state
   */
  getProbeState(probeId) {
    return this.probeStates.get(probeId);
  }
  
  /**
   * Record alert
   */
  recordAlert(alert) {
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.maxAlerts) {
      this.alertHistory = this.alertHistory.slice(0, this.maxAlerts);
    }
    this.notifyListeners('alert', alert);
  }
  
  /**
   * Get alert history
   */
  getAlertHistory() {
    return this.alertHistory;
  }
  
  /**
   * Disconnect serial service
   */
  async disconnect() {
    if (this.serialService) {
      await this.serialService.disconnect();
    }
  }
}

module.exports = TelemetryService;
