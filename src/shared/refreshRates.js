// shared/refreshRates.js — standard display refresh rates (0.00222): the
// frame-rate summary's hz is one of these (core/perfMonitor.js) and the
// stats page grades against them (analytics/perf.js). A fact table, not
// tuning — one copy for both.
export const RATES = [30, 48, 50, 60, 75, 90, 100, 120, 144, 165, 240];
// The standard rate nearest a frame interval in ms.
export const snapRate = (ms) => RATES.reduce((a, r) => (Math.abs(1000 / r - ms) < Math.abs(1000 / a - ms) ? r : a));
