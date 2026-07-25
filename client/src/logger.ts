export interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "API";
  tag: string;
  message: string;
  details?: any;
}

const MAX_LOGS = 200;
const logHistory: LogEntry[] = [];
type LogListener = (logs: LogEntry[]) => void;
const listeners: LogListener[] = [];

function notifyListeners() {
  const currentLogs = [...logHistory];
  listeners.forEach((fn) => {
    try {
      fn(currentLogs);
    } catch {
      // ignore listener errors
    }
  });
}

export function subscribeLogs(listener: LogListener) {
  listeners.push(listener);
  listener([...logHistory]);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function addLog(level: LogEntry["level"], tag: string, message: string, details?: any) {
  const entry: LogEntry = {
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toLocaleTimeString("vi-VN", { hour12: false }) + "." + String(new Date().getMilliseconds()).padStart(3, "0"),
    level,
    tag,
    message,
    details
  };

  logHistory.unshift(entry);
  if (logHistory.length > MAX_LOGS) {
    logHistory.pop();
  }
  notifyListeners();
}

const BADGE_STYLES = {
  INFO: "background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
  WARN: "background: #ea580c; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
  ERROR: "background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;",
  API: "background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;"
};

export const logger = {
  info(tag: string, message: string, details?: any) {
    addLog("INFO", tag, message, details);
    console.log(`%c[SmailBox INFO]%c [${tag}] ${message}`, BADGE_STYLES.INFO, "color: #0284c7; font-weight: bold;", details ?? "");
  },

  warn(tag: string, message: string, details?: any) {
    addLog("WARN", tag, message, details);
    console.warn(`%c[SmailBox WARN]%c [${tag}] ${message}`, BADGE_STYLES.WARN, "color: #ea580c; font-weight: bold;", details ?? "");
  },

  error(tag: string, message: string, error?: any, details?: any) {
    const errObj = {
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...(error && typeof error === "object" ? error : {}),
      ...(details ? { extra: details } : {})
    };

    addLog("ERROR", tag, message, errObj);

    console.group(`%c[SmailBox ERROR]%c [${tag}] ${message}`, BADGE_STYLES.ERROR, "color: #dc2626; font-weight: bold;");
    console.error("🔍 Chi tiết lỗi:", error);
    if (details) console.error("📦 Thông tin kèm theo:", details);
    console.groupEnd();
  },

  apiCall(method: string, url: string, reqBody: any, status: number, resBody: any, durationMs: number) {
    const isOk = status >= 200 && status < 300;
    const level: LogEntry["level"] = isOk ? "API" : "ERROR";
    const statusText = `${method.toUpperCase()} ${url} -> HTTP ${status} (${durationMs}ms)`;

    addLog(level, "API", statusText, { reqBody, resBody, status, durationMs });

    if (isOk) {
      console.groupCollapsed(`%c[SmailBox API]%c ${method.toUpperCase()} ${url} %c[${status}] (${durationMs}ms)`, BADGE_STYLES.API, "color: #4f46e5; font-weight: bold;", "color: #16a34a; font-weight: bold;");
      if (reqBody) console.log("📤 Request Payload:", reqBody);
      console.log("📥 Response Data:", resBody);
      console.groupEnd();
    } else {
      console.group(`%c[SmailBox API ERROR]%c ${method.toUpperCase()} ${url} %c[HTTP ${status}] (${durationMs}ms)`, BADGE_STYLES.ERROR, "color: #dc2626; font-weight: bold;", "color: #dc2626; font-weight: bold;");
      if (reqBody) console.error("📤 Request Payload:", reqBody);
      console.error("❌ Backend Error Response:", resBody);
      console.groupEnd();
    }
  },

  getLogs() {
    return [...logHistory];
  },

  clearLogs() {
    logHistory.length = 0;
    notifyListeners();
  },

  exportLogsText() {
    if (logHistory.length === 0) return "Chưa có nhật ký hệ thống nào.";
    return logHistory
      .slice()
      .reverse()
      .map((l) => `[${l.timestamp}] [${l.level}] [${l.tag}] ${l.message}\n${l.details ? JSON.stringify(l.details, null, 2) : ""}`)
      .join("\n----------------------------------------\n");
  }
};

// Global Error Catchers for F12 DevTools
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    logger.error("WINDOW_ERROR", event.message || "Lỗi JavaScript không xác định", event.error, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logger.error("UNHANDLED_PROMISE", "Promise bị từ chối mà không được xử lý (Unhandled Rejection)", event.reason);
  });

  // Make logger globally accessible in F12 console via window.SmailBoxLogger
  (window as any).SmailBoxLogger = logger;
  console.log(
    "%c[SmailBox Monitor]%c Đã kích hoạt hệ thống Giám sát & Ghi log Console F12! Nhập %cwindow.SmailBoxLogger.exportLogsText()%c để xuất báo cáo log.",
    "background: #4f46e5; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;",
    "color: #4f46e5; font-weight: bold;",
    "color: #ea580c; font-weight: bold; background: #fff7ed; padding: 2px 4px; border-radius: 4px;",
    "color: #4f46e5;"
  );
}
