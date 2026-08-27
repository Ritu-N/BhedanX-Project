import { calculatePriority, getPriorityStatus } from '../utils/scoring';

export function stepProbe(probe, event = null) {
  // Handle offline probes - stop updating their telemetry
  if (probe.online === false) {
    return probe;
  }

  // Define target values for events
  const target = event === 'tap' 
    ? { vibration: 72, acoustic: probe.acoustic, persistence: 66 } 
    : event === 'high' 
    ? { vibration: 88, acoustic: 80, persistence: 84 } 
    : event === 'acoustic' 
    ? { vibration: probe.vibration, acoustic: 78, persistence: 68 } 
    : event === 'normal'
    ? { vibration: 35, acoustic: 25, persistence: 30 }
    : null;

  // Smooth drift function for gradual changes
  const drift = (value, amount = 7) => Math.max(0, Math.min(100, Math.round(value + (Math.random() * amount * 2 - amount))));

  // Calculate next telemetry values
  const next = { 
    ...probe, 
    vibration: target 
      ? Math.round(probe.vibration + (target.vibration - probe.vibration) * 0.45) 
      : drift(probe.vibration, 4),
    acoustic: target 
      ? Math.round(probe.acoustic + (target.acoustic - probe.acoustic) * 0.45) 
      : drift(probe.acoustic, 4),
    persistence: target 
      ? Math.round(probe.persistence + (target.persistence - probe.persistence) * 0.45) 
      : drift(probe.persistence, 3),
    signalQuality: drift(probe.signalQuality, 2),
    lastUpdate: Date.now()
  };

  // Simulate battery drain - decreases by 0.1-0.3% per update (very gradual)
  if (probe.battery > 0) {
    next.battery = Math.max(0, Math.round((probe.battery * 100 - Math.random() * 30) / 100));
  }

  // Simulate occasional communication issues (5% chance)
  if (Math.random() < 0.05 && next.signalQuality > 60) {
    next.communication = Math.random() < 0.3 ? 'WEAK' : 'GOOD';
  } else {
    next.communication = next.signalQuality > 70 ? 'GOOD' : 'WEAK';
  }

  // Calculate priority score
  next.priorityScore = calculatePriority(next);
  next.status = next.online === false ? 'OFFLINE' : getPriorityStatus(next.priorityScore);

  return next;
}
