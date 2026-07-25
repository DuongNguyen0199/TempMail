import React, { useEffect, useState } from "react";
import { Check, Copy, AlertTriangle, Info, Terminal, Trash2, X } from "lucide-react";
import { logger, LogEntry, subscribeLogs } from "../logger";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ConsoleMonitorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = subscribeLogs(setLogs);
    return () => unsubscribe();
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filterLevel !== "ALL" && log.level !== filterLevel) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(term);
      const matchTag = log.tag.toLowerCase().includes(term);
      const matchDetails = JSON.stringify(log.details || {}).toLowerCase().includes(term);
      return matchMsg || matchTag || matchDetails;
    }
    return true;
  });

  const handleCopy = () => {
    const text = logger.exportLogsText();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          width: "100%",
          maxWidth: "960px",
          height: "85vh",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid #334155"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#1e293b"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Terminal size={22} color="#6366f1" />
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#f1f5f9" }}>
                Giám sát hệ thống & Nhật ký Console (DevTools Monitor)
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                Ghi nhận toàn bộ hoạt động API, lỗi gửi mail và sự kiện F12 thời gian thực.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px"
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: "12px 20px",
            background: "#0f172a",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              style={{
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px"
              }}
            >
              <option value="ALL">Tất cả Log ({logs.length})</option>
              <option value="ERROR">Chỉ Lỗi (ERROR)</option>
              <option value="API">Yêu cầu API</option>
              <option value="INFO">Thông tin (INFO)</option>
              <option value="WARN">Cảnh báo (WARN)</option>
            </select>

            <input
              type="text"
              placeholder="Tìm kiếm từ khóa log..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                width: "220px"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => logger.clearLogs()}
              style={{
                background: "#334155",
                color: "#cbd5e1",
                border: "none",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <Trash2 size={14} /> Xóa bớt log
            </button>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "#16a34a" : "#4f46e5",
                color: "white",
                border: "none",
                padding: "6px 14px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Đã sao chép!" : "📋 Sao chép báo cáo gửi AI"}
            </button>
          </div>
        </div>

        {/* Log Window */}
        <div
          style={{
            flex: 1,
            padding: "16px",
            overflowY: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "13px",
            lineHeight: "1.6",
            background: "#020617"
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <Info size={32} style={{ marginBottom: "8px", opacity: 0.5 }} />
              <p>Chưa có log nào phù hợp với bộ lọc.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              let bg = "transparent";
              let badgeBg = "#0284c7";

              if (log.level === "ERROR") {
                bg = "rgba(220, 38, 38, 0.1)";
                badgeBg = "#dc2626";
              } else if (log.level === "API") {
                badgeBg = "#4f46e5";
              } else if (log.level === "WARN") {
                badgeBg = "#ea580c";
              }

              return (
                <div
                  key={log.id}
                  style={{
                    marginBottom: "12px",
                    padding: "10px 14px",
                    borderRadius: "6px",
                    backgroundColor: bg,
                    borderLeft: `4px solid ${badgeBg}`,
                    borderBottom: "1px solid rgba(255,255,255,0.05)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b", fontSize: "11px" }}>[{log.timestamp}]</span>
                    <span
                      style={{
                        backgroundColor: badgeBg,
                        color: "white",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: "bold"
                      }}
                    >
                      {log.level}
                    </span>
                    <span style={{ color: "#94a3b8", fontWeight: 600 }}>[{log.tag}]</span>
                    <span style={{ color: log.level === "ERROR" ? "#fca5a5" : "#f1f5f9", flex: 1 }}>{log.message}</span>
                  </div>

                  {log.details && (
                    <pre
                      style={{
                        margin: "6px 0 0 0",
                        padding: "8px 12px",
                        backgroundColor: "rgba(0, 0, 0, 0.4)",
                        borderRadius: "4px",
                        color: log.level === "ERROR" ? "#fca5a5" : "#cbd5e1",
                        fontSize: "12px",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word"
                      }}
                    >
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
