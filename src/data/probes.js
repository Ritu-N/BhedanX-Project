import { calculatePriority, getPriorityStatus } from '../utils/scoring';
const seed = [
  ['P-01','Zone A','Sector 1',22,12,4,18,92], ['P-02','Zone A','Sector 2',45,38,28,86,76], ['P-03','Zone A','Sector 3',86,74,82,91,78], ['P-04','Zone B','Sector 1',69,55,62,88,64],
  ['P-05','Zone B','Sector 2',34,28,36,90,83], ['P-06','Zone C','Sector 1',18,8,14,94,95], ['P-07','Zone C','Sector 2',57,44,49,81,71], ['P-08','Zone D','Sector 1',27,15,20,89,88]
];
export const initialProbes = seed.map(([id, zone, sector, vibration, acoustic, persistence, signalQuality, battery], index) => ({ id, zone, sector, vibration, acoustic, persistence, signalQuality, battery, communication: 'GOOD', online: true, lastUpdate: Date.now() - index * 18000, priorityScore: calculatePriority({ vibration, acoustic, persistence, signalQuality }), history: [] }));
export function enrichProbe(probe) { return { ...probe, status: probe.online ? getPriorityStatus(probe.priorityScore) : 'OFFLINE' }; }
