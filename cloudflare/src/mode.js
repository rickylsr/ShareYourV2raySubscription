import { FREE_LIMITS, PAID_LIMITS } from '../../shared/limits.js';

export function workerMode(value) {
  const mode = value === undefined ? 'free' : String(value).trim().toLowerCase();
  if (mode !== 'free' && mode !== 'paid') throw new TypeError('WORKERS_MODE must be free or paid.');
  return mode;
}

export function modeLimits(value) {
  return workerMode(value) === 'free' ? FREE_LIMITS : PAID_LIMITS;
}
