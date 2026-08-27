/**
 * BhedanX Serial Service
 * 
 * Reads telemetry from ESP32 gateway via USB serial port
 * Parses JSON telemetry packets and routes to application
 * Provides gateway status and packet statistics
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

class SerialService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      port: config.port || process.env.BHEDANX_SERIAL_PORT || null,
      baudRate: config.baudRate || 115200,
      autoOpen: config.autoOpen !== false,
      reconnectDelay: config.reconnectDelay || 3000,
      ...config
    };
    
    this.port = null;
    this.parser = null;
    this.connected = false;
    this.packetCount = 0;
    this.lastPacketTime = null;
    this.packetLostCount = 0;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 999;
    
    if (this.config.autoOpen && this.config.port) {
      this.connect();
    }
  }
  
  /**
   * Connect to serial port
   */
  connect() {
    if (this.connected || this.isReconnecting) {
      return Promise.resolve();
    }
    
    if (!this.config.port) {
      return Promise.reject(new Error('No serial port specified. Set BHEDANX_SERIAL_PORT environment variable.'));
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.port = new SerialPort({
          path: this.config.port,
          baudRate: this.config.baudRate,
          autoOpen: false
        });
        
        this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));
        
        this.port.on('error', (err) => {
          this.handleError(err);
          reject(err);
        });
        
        this.port.on('close', () => {
          this.handleClose();
        });
        
        this.parser.on('data', (data) => {
          this.handleData(data);
        });
        
        this.port.open((err) => {
          if (err) {
            this.handleError(err);
            reject(err);
          } else {
            this.connected = true;
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.emit('connected', { port: this.config.port });
            console.log(`[SerialService] Connected to ${this.config.port}`);
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }
  
  /**
   * Disconnect from serial port
   */
  disconnect() {
    if (this.port && this.port.isOpen) {
      return new Promise((resolve) => {
        this.port.close(() => {
          this.connected = false;
          resolve();
        });
      });
    }
    return Promise.resolve();
  }
  
  /**
   * Handle incoming serial data
   */
  handleData(data) {
    if (!data || data.trim().length === 0) {
      return;
    }
    
    const line = data.trim();
    
    // Check for debug lines
    if (line.startsWith('DEBUG:')) {
      if (process.env.BHEDANX_DEBUG) {
        console.log(`[DEBUG] ${line.substring(6)}`);
      }
      return;
    }
    
    // Parse JSON telemetry
    try {
      const json = JSON.parse(line);
      
      if (json.type === 'GATEWAY_STARTUP') {
        this.emit('gateway-startup', json);
        console.log('[SerialService] Gateway startup detected');
      } else if (json.type === 'GATEWAY_HEARTBEAT') {
        this.emit('gateway-heartbeat', json);
      } else if (json.probeId) {
        // Standard telemetry packet
        this.packetCount++;
        this.lastPacketTime = new Date();
        this.emit('telemetry', json);
      } else {
        console.log('[SerialService] Unknown packet type:', json);
      }
    } catch (err) {
      console.error(`[SerialService] Failed to parse JSON: ${line}`, err.message);
    }
  }
  
  /**
   * Handle serial port errors
   */
  handleError(err) {
    console.error(`[SerialService] Error: ${err.message}`);
    this.emit('error', err);
    
    if (!this.isReconnecting) {
      this.attemptReconnect();
    }
  }
  
  /**
   * Handle serial port close
   */
  handleClose() {
    this.connected = false;
    this.emit('disconnected');
    console.log('[SerialService] Disconnected from serial port');
    
    if (!this.isReconnecting) {
      this.attemptReconnect();
    }
  }
  
  /**
   * Attempt to reconnect to serial port
   */
  attemptReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    console.log(`[SerialService] Attempting to reconnect (attempt ${this.reconnectAttempts})...`);
    
    setTimeout(() => {
      this.connect()
        .catch((err) => {
          console.error(`[SerialService] Reconnection failed: ${err.message}`);
          this.isReconnecting = false;
          this.attemptReconnect();
        });
    }, this.config.reconnectDelay);
  }
  
  /**
   * Get gateway status
   */
  getStatus() {
    return {
      connected: this.connected,
      port: this.config.port,
      packetCount: this.packetCount,
      lastPacketTime: this.lastPacketTime,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }
  
  /**
   * Validate telemetry packet
   */
  static validateTelemetry(telemetry) {
    const errors = [];
    
    // Check required fields
    if (!telemetry.probeId) errors.push('Missing probeId');
    if (telemetry.timestamp === undefined) errors.push('Missing timestamp');
    if (telemetry.vibration === undefined) errors.push('Missing vibration');
    if (telemetry.acoustic === undefined) errors.push('Missing acoustic');
    if (telemetry.persistence === undefined) errors.push('Missing persistence');
    if (telemetry.signalQuality === undefined) errors.push('Missing signalQuality');
    if (telemetry.priorityScore === undefined) errors.push('Missing priorityScore');
    if (!telemetry.status) errors.push('Missing status');
    
    // Validate ranges
    if (telemetry.vibration < 0 || telemetry.vibration > 100) errors.push('vibration out of range (0-100)');
    if (telemetry.acoustic < 0 || telemetry.acoustic > 100) errors.push('acoustic out of range (0-100)');
    if (telemetry.persistence < 0 || telemetry.persistence > 100) errors.push('persistence out of range (0-100)');
    if (telemetry.signalQuality < 0 || telemetry.signalQuality > 100) errors.push('signalQuality out of range (0-100)');
    if (telemetry.priorityScore < 0 || telemetry.priorityScore > 100) errors.push('priorityScore out of range (0-100)');
    
    return errors;
  }
}

module.exports = SerialService;
