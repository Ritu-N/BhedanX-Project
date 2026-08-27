export const ARIA_WEIGHTS = { vibration: 0.4, acoustic: 0.25, persistence: 0.25, signalQuality: 0.1 };
export function calculatePriority({ vibration = 0, acoustic = 0, persistence = 0, signalQuality = 0 }, weights = ARIA_WEIGHTS) {
  return Math.round(Math.max(0, Math.min(100, vibration * weights.vibration + acoustic * weights.acoustic + persistence * weights.persistence + signalQuality * weights.signalQuality)));
}
export function getPriorityStatus(score = 0) { if (score >= 80) return 'CRITICAL'; if (score >= 60) return 'HIGH_PRIORITY'; if (score >= 30) return 'SUSPICIOUS'; return 'NORMAL'; }
export const statusLabel = { CRITICAL: 'CRITICAL', HIGH_PRIORITY: 'HIGH PRIORITY', SUSPICIOUS: 'SUSPICIOUS', NORMAL: 'NORMAL', OFFLINE: 'OFFLINE' };
export const statusTone = { CRITICAL: 'critical', HIGH_PRIORITY: 'high', SUSPICIOUS: 'suspicious', NORMAL: 'normal', OFFLINE: 'offline' };
