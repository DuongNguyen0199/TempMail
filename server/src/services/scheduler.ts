import { runAutoForwardBatchAllUsers } from "./auto-forward.service.js";

const BATCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

let timerId: NodeJS.Timeout | null = null;

export function startAutoForwardScheduler() {
  if (timerId) return;

  console.log("[Scheduler] Auto-forward batch scheduler started (Interval: 30 minutes)");

  // Run initial batch after 10 seconds of server boot, then every 30 mins
  setTimeout(async () => {
    try {
      console.log("[Scheduler] Running initial auto-forward batch...");
      const res = await runAutoForwardBatchAllUsers();
      console.log(`[Scheduler] Initial auto-forward batch completed. Total emails forwarded: ${res.totalForwarded}`);
    } catch (err) {
      console.error("[Scheduler] Error in initial auto-forward batch:", err);
    }
  }, 10000);

  timerId = setInterval(async () => {
    try {
      console.log("[Scheduler] Running scheduled 30-minute auto-forward batch...");
      const res = await runAutoForwardBatchAllUsers();
      console.log(`[Scheduler] 30-minute auto-forward batch completed. Total emails forwarded: ${res.totalForwarded}`);
    } catch (err) {
      console.error("[Scheduler] Error in scheduled auto-forward batch:", err);
    }
  }, BATCH_INTERVAL_MS);
}

export function stopAutoForwardScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
