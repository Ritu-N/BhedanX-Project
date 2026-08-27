import { calculatePriority, getPriorityStatus } from '../utils/scoring';
export function stepProbe(probe, event = null) {
  const target = event === 'tap' ? { vibration: 72, acoustic: probe.acoustic, persistence: 66 } : event === 'high' ? { vibration: 88, acoustic: 80, persistence: 84 } : event === 'acoustic' ? { vibration: probe.vibration, acoustic: 78, persistence: 68 } : null;
  const drift = (value, amount = 7) => Math.max(0, Math.min(100, Math.round(value + (Math.random() * amount * 2 - amount))));
  const next = { ...probe, vibration: target ? Math.round(probe.vibration + (target.vibration - probe.vibration) * 0.45) : drift(probe.vibration, 4), acoustic: target ? Math.round(probe.acoustic + (target.acoustic - probe.acoustic) * 0.45) : drift(probe.acoustic, 4), persistence: target ? Math.round(probe.persistence + (target.persistence - probe.persistence) * 0.45) : drift(probe.persistence, 3), signalQuality: drift(probe.signalQuality, 2), lastUpdate: Date.now() };
  next.priorityScore = calculatePriority(next); next.status = getPriorityStatus(next.priorityScore); return next;
}
