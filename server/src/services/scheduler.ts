import { runAutoForwardBatchAllUsers } from "./auto-forward.service.js";

let lastRunTime: Date | null = null;
let timerId: NodeJS.Timeout | null = null;

// Check tick interval: 1 minute
const TICK_INTERVAL_MS = 1 * 60 * 1000;

export function shouldRunSmartBatch(now: Date = new Date(), lastRun: Date | null = lastRunTime): boolean {
  if (!lastRun) return true;

  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  const elapsedMs = now.getTime() - lastRun.getTime();
  const elapsedMinutes = elapsedMs / (1000 * 60);

  // Friday (Thứ 6): 30 minutes interval
  if (dayOfWeek === 5) {
    return elapsedMinutes >= 30;
  }

  // Mon-Thu & Sat-Sun (Thứ 2 -> Thứ 5, Thứ 7, CN): 1 time per day (24 hours = 1440 mins)
  return elapsedMinutes >= 24 * 60;
}

export function getSchedulerStatus() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const isFriday = dayOfWeek === 5;
  const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

  return {
    currentDay: dayNames[dayOfWeek],
    isFriday,
    mode: isFriday ? "FRIDAY_FAST_MODE (30 phút / 1 lần)" : "DAILY_MODE (1 ngày / 1 lần)",
    scheduleText: isFriday
      ? "⚡ Thứ 6: Đang chạy Batch nhanh cứ 30 phút / 1 lần"
      : `📅 ${dayNames[dayOfWeek]}: Đang chạy Batch định kỳ 1 ngày / 1 lần`,
    intervalMinutes: isFriday ? 30 : 1440,
    lastRunTime: lastRunTime ? lastRunTime.toISOString() : null,
    nextEstimatedRun: lastRunTime
      ? new Date(lastRunTime.getTime() + (isFriday ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000)).toISOString()
      : null
  };
}

export function startAutoForwardScheduler() {
  if (timerId) return;

  console.log("[Scheduler] Smart Dynamic Auto-Forward Scheduler started!");
  console.log("[Scheduler] Schedule rules: Friday = Every 30 mins | Mon-Thu & Sat-Sun = 1 time / day");

  // Initial batch 10 seconds after server boot
  setTimeout(async () => {
    try {
      console.log("[Scheduler] Running initial smart auto-forward batch...");
      const res = await runAutoForwardBatchAllUsers();
      lastRunTime = new Date();
      console.log(`[Scheduler] Initial smart batch completed. Forwarded: ${res.totalForwarded}`);
    } catch (err) {
      console.error("[Scheduler] Error in initial smart batch:", err);
    }
  }, 10000);

  // Check schedule tick every 1 minute
  timerId = setInterval(async () => {
    const now = new Date();
    if (shouldRunSmartBatch(now, lastRunTime)) {
      try {
        const status = getSchedulerStatus();
        console.log(`[Scheduler] Triggering Smart Batch (${status.currentDay} - ${status.scheduleText})...`);
        const res = await runAutoForwardBatchAllUsers();
        lastRunTime = new Date();
        console.log(`[Scheduler] Smart Batch completed. Total forwarded: ${res.totalForwarded}`);
      } catch (err) {
        console.error("[Scheduler] Error running smart batch:", err);
      }
    }
  }, TICK_INTERVAL_MS);
}

export function stopAutoForwardScheduler() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}
