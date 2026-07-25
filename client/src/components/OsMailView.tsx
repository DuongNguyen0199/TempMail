import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  LoaderCircle,
  Mail,
  MailOpen,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  X
} from "lucide-react";
import { api } from "../api";
import type { GmailAccount, OsMail, Pagination } from "../types";
import { formatMessageTime, initials, senderName } from "../utils";

interface Props {
  accounts: GmailAccount[];
  notify: (msg: string, type?: "success" | "error") => void;
}

export const OsMailView: React.FC<Props> = ({ accounts, notify }) => {
  const [selectedAccountEmail, setSelectedAccountEmail] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [osMails, setOsMails] = useState<OsMail[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, pages: 1 });
  const [stats, setStats] = useState({ total: 0, forwarded: 0, pending: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMail, setSelectedMail] = useState<OsMail | null>(null);

  const loadOsMails = async (page = 1) => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: "25",
        ...(selectedAccountEmail !== "ALL" ? { email: selectedAccountEmail } : {}),
        ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
        ...(searchTerm.trim() ? { search: searchTerm.trim() } : {})
      });

      const res = await api<{
        data: OsMail[];
        pagination: Pagination;
        stats: { total: number; forwarded: number; pending: number; failed: number };
      }>(`/profile/os-mails?${query}`);

      setOsMails(res.data);
      setPagination(res.pagination);
      setStats(res.stats);
    } catch (err) {
      console.error(err);
      notify("Không thể tải danh sách OutSystems Mail.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOsMails(1);
  }, [selectedAccountEmail, selectedStatus]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void loadOsMails(1);
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await api<{ success: boolean; detail?: string }>("/profile/os-mails/sync", {
        method: "POST"
      });
      notify(res.detail || "Đã đồng bộ dữ liệu OutSystems Mail dùng chung thành công!");
      await loadOsMails(pagination.page);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi đồng bộ OS Mail.", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handleRunBatchNow = async () => {
    setRunningBatch(true);
    try {
      const res = await api<{ count: number; status: string; detail?: string }>("/profile/auto-forward/run-now", {
        method: "POST"
      });
      if (res.detail) {
        notify(res.detail, res.count > 0 ? "success" : "error");
      } else if (res.count > 0) {
        notify(`Hoàn tất Batch! Đã chuyển tiếp thành công ${res.count} email OutSystems.`);
      } else {
        notify("Batch đã hoàn tất. Không có email mới cần gửi.");
      }
      await loadOsMails(pagination.page);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi chạy Batch.", "error");
    } finally {
      setRunningBatch(false);
    }
  };

  return (
    <div className="content-page inbox-page" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top Heading & Summary Cards */}
      <div style={{ padding: "20px 24px 10px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
          <div>
            <span className="eyebrow" style={{ color: "#4f46e5", fontWeight: 600 }}>Cơ sở dữ liệu OS Mail</span>
            <h1 style={{ fontSize: "24px", fontWeight: 700, margin: "2px 0 4px 0" }}>OutSystems Mail Dashboard</h1>
            <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
              Tự động lưu và theo dõi trạng thái gửi mail chứa tiêu đề "OutSystems" dùng chung cho toàn bộ hệ thống.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="button button--secondary"
              onClick={handleSyncAll}
              disabled={syncing || runningBatch}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", fontSize: "14px", fontWeight: 600, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}
            >
              <RotateCw size={16} className={syncing ? "spin" : ""} />
              <span>{syncing ? "Đang đồng bộ OS Mail..." : "🔄 Đồng bộ OS Mail (Sync)"}</span>
            </button>

            <button
              className="button button--primary"
              onClick={handleRunBatchNow}
              disabled={runningBatch || syncing}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", fontSize: "14px" }}
            >
              <Play size={16} className={runningBatch ? "spin" : ""} />
              <span>{runningBatch ? "Đang quét & gửi Batch..." : "🚀 Chạy Batch gửi mail ngay"}</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
          <div style={{ background: "white", padding: "14px 18px", borderRadius: "10px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>TỔNG SỐ OS MAIL</span>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#1e293b", marginTop: "2px" }}>{stats.total}</div>
          </div>

          <div style={{ background: "#f0fdf4", padding: "14px 18px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
            <span style={{ fontSize: "12px", color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={14} color="#16a34a" /> ĐÃ GỬI MAIL THÀNH CÔNG
            </span>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#15803d", marginTop: "2px" }}>{stats.forwarded}</div>
          </div>

          <div style={{ background: "#fffbebe", padding: "14px 18px", borderRadius: "10px", border: "1px solid #fde68a" }}>
            <span style={{ fontSize: "12px", color: "#b45309", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={14} color="#d97706" /> CHỜ GỬI BATCH
            </span>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#b45309", marginTop: "2px" }}>{stats.pending}</div>
          </div>

          <div style={{ background: "#fef2f2", padding: "14px 18px", borderRadius: "10px", border: "1px solid #fecaca" }}>
            <span style={{ fontSize: "12px", color: "#991b1b", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertCircle size={14} color="#dc2626" /> LỖI GỬI MAIL
            </span>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#dc2626", marginTop: "2px" }}>{stats.failed}</div>
          </div>
        </div>
      </div>

      {/* Main Mail Reader Layout */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: selectedMail ? "420px 1fr" : "1fr", gap: "16px", padding: "0 24px 20px 24px", overflow: "hidden" }}>
        
        {/* Mail List Column */}
        <section className="inbox-column" style={{ display: "flex", flexDirection: "column", height: "100%", background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          
          {/* Filters Bar */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select
                value={selectedAccountEmail}
                onChange={(e) => setSelectedAccountEmail(e.target.value)}
                style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "white" }}
              >
                <option value="ALL">📧 Tất cả Gmail ({accounts.length})</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.email}>
                    {acc.email}
                  </option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px", background: "white", fontWeight: 500 }}
              >
                <option value="ALL">Tất cả Trạng thái</option>
                <option value="FORWARDED">🟢 Đã gửi mail</option>
                <option value="PENDING">🟡 Chờ gửi batch</option>
                <option value="FAILED">🔴 Lỗi gửi mail</option>
              </select>
            </div>

            <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  type="text"
                  placeholder="Tìm người gửi, từ khóa tiêu đề..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{ width: "100%", paddingLeft: "32px", paddingRight: "10px", paddingTop: "6px", paddingBottom: "6px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "13px" }}
                />
              </div>
              <button type="submit" className="button button--compact">Lọc</button>
            </form>
          </div>

          {/* List Content */}
          <div className="message-list" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {loading ? (
              <div className="loading-state"><LoaderCircle className="spin" /> Đang tải dữ liệu OS Mail...</div>
            ) : osMails.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon"><MailOpen size={24} /></span>
                <h3>Chưa có OutSystems Mail nào trong CSDL</h3>
                <p>Bấm nút "Chạy Batch gửi mail ngay" để quét tất cả hòm thư và lưu vào CSDL.</p>
              </div>
            ) : (
              osMails.map((mail) => {
                const isActive = selectedMail?.id === mail.id;
                let statusColor = "#eab308";
                let statusBg = "#fef9c3";
                let statusLabel = "Chờ gửi batch";

                if (mail.status === "FORWARDED") {
                  statusColor = "#16a34a";
                  statusBg = "#dcfce7";
                  statusLabel = "Đã gửi mail";
                } else if (mail.status === "FAILED") {
                  statusColor = "#dc2626";
                  statusBg = "#fee2e2";
                  statusLabel = "Lỗi gửi mail";
                }

                return (
                  <div
                    key={mail.id}
                    onClick={() => setSelectedMail(mail)}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "8px",
                      marginBottom: "6px",
                      cursor: "pointer",
                      backgroundColor: isActive ? "#eef2ff" : "white",
                      border: isActive ? "1.5px solid #6366f1" : "1px solid #e2e8f0",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "#4f46e5" }}>{mail.email}</span>
                      <span
                        style={{
                          backgroundColor: statusBg,
                          color: statusColor,
                          padding: "2px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        {mail.status === "FORWARDED" && <CheckCircle2 size={12} />}
                        {mail.status === "PENDING" && <Clock size={12} />}
                        {mail.status === "FAILED" && <AlertCircle size={12} />}
                        {statusLabel}
                      </span>
                    </div>

                    <div style={{ fontWeight: 600, fontSize: "13px", color: "#1e293b", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {mail.subject || "(Không có tiêu đề)"}
                    </div>

                    <div style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Từ: {senderName(mail.sender)} ({mail.sender || "Unknown"})
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "11px", color: "#94a3b8" }}>
                      <span>Nhận: {formatMessageTime(mail.receivedAt)}</span>
                      {mail.forwardedAt && <span style={{ color: "#16a34a" }}>Đã gửi: {formatMessageTime(mail.forwardedAt)}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div className="pagination" style={{ padding: "10px 16px", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
            <span>Trang {pagination.page} / {pagination.pages}</span>
            <div>
              <button className="icon-button" disabled={pagination.page <= 1} onClick={() => void loadOsMails(pagination.page - 1)}>
                <ChevronLeft size={17} />
              </button>
              <button className="icon-button" disabled={pagination.page >= pagination.pages} onClick={() => void loadOsMails(pagination.page + 1)}>
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </section>

        {/* Mail Detail Reader Column */}
        {selectedMail && (
          <section className="reader-column" style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="reader-toolbar" style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button className="icon-button" onClick={() => setSelectedMail(null)}><ArrowLeft size={18} /></button>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>Chi tiết OS Mail</span>
              </div>
              <button className="icon-button" onClick={() => setSelectedMail(null)}><X size={18} /></button>
            </div>

            <article className="reader-content" style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              <div style={{ marginBottom: "16px" }}>
                <span
                  style={{
                    backgroundColor: selectedMail.status === "FORWARDED" ? "#dcfce7" : selectedMail.status === "FAILED" ? "#fee2e2" : "#fef9c3",
                    color: selectedMail.status === "FORWARDED" ? "#16a34a" : selectedMail.status === "FAILED" ? "#dc2626" : "#eab308",
                    padding: "4px 10px",
                    borderRadius: "16px",
                    fontSize: "12px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  {selectedMail.status === "FORWARDED" ? "🟢 ĐÃ GỬI MAIL CHUYỂN TIẾP THÀNH CÔNG" : selectedMail.status === "FAILED" ? "🔴 LỖI GỬI MAIL" : "🟡 CHỜ CHẠY BATCH GỬI MAIL"}
                </span>

                {selectedMail.errorMessage && (
                  <div style={{ marginTop: "10px", background: "#fef2f2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", border: "1px solid #fecaca", fontSize: "13px" }}>
                    ⚠️ <strong>Lỗi gửi:</strong> {selectedMail.errorMessage}
                  </div>
                )}
              </div>

              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 12px 0", color: "#0f172a" }}>
                {selectedMail.subject || "(Không có tiêu đề)"}
              </h2>

              <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "20px", fontSize: "13px", lineHeight: "1.6" }}>
                <p style={{ margin: "2px 0" }}><strong>Hòm thư nhận:</strong> <span style={{ color: "#4f46e5", fontWeight: 600 }}>{selectedMail.email}</span></p>
                <p style={{ margin: "2px 0" }}><strong>Người gửi gốc:</strong> {selectedMail.sender || "Không rõ"}</p>
                <p style={{ margin: "2px 0" }}><strong>Thời gian nhận:</strong> {selectedMail.receivedAt ? new Date(selectedMail.receivedAt).toLocaleString("vi-VN") : "N/A"}</p>
                {selectedMail.forwardedAt && <p style={{ margin: "2px 0" }}><strong>Thời gian đã gửi mail:</strong> <span style={{ color: "#16a34a" }}>{new Date(selectedMail.forwardedAt).toLocaleString("vi-VN")}</span></p>}
              </div>

              <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
                <h4 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 10px 0", color: "#475569" }}>Nội dung Email:</h4>
                <div
                  className="email-body"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selectedMail.body || selectedMail.snippet || "<p>Chưa có nội dung body.</p>", {
                      USE_PROFILES: { html: true },
                      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
                      FORBID_ATTR: ["onerror", "onload", "onclick"]
                    })
                  }}
                />
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  );
};
