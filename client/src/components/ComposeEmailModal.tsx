import React, { useState } from "react";
import { LoaderCircle, Mail, Send, X } from "lucide-react";
import { api } from "../api";
import type { GmailAccount } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accounts: GmailAccount[];
  notify: (msg: string, type?: "success" | "error") => void;
}

export const ComposeEmailModal: React.FC<Props> = ({ isOpen, onClose, accounts, notify }) => {
  const [fromEmail, setFromEmail] = useState(accounts[0]?.email || "");
  const [toText, setToText] = useState("");
  const [ccText, setCcText] = useState("");
  const [bccText, setBccText] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const to = toText.split(",").map((s) => s.trim()).filter(Boolean);
    const cc = ccText.split(",").map((s) => s.trim()).filter(Boolean);
    const bcc = bccText.split(",").map((s) => s.trim()).filter(Boolean);

    if (to.length === 0) {
      notify("Vui lòng nhập ít nhất 1 email nhận.", "error");
      return;
    }
    if (!subject.trim()) {
      notify("Vui lòng nhập tiêu đề email.", "error");
      return;
    }

    setSending(true);
    try {
      const res = await api<{ success: boolean; detail?: string }>("/profile/send-email", {
        method: "POST",
        body: JSON.stringify({
          fromEmail: fromEmail || undefined,
          to,
          cc: cc.length > 0 ? cc : undefined,
          bcc: bcc.length > 0 ? bcc : undefined,
          subject: subject.trim(),
          bodyText: bodyText.trim(),
          bodyHtml: bodyText.trim().replace(/\n/g, "<br />")
        })
      });

      notify(res.detail || "Đã gửi email thành công!");
      onClose();
      // Reset form
      setToText("");
      setSubject("");
      setBodyText("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Đã có lỗi xảy ra khi gửi email.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "640px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column"
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                backgroundColor: "#e0e7ff",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Send size={18} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>
                Soạn & Gửi Email mới
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Gửi qua Sonjj SMTP Relay (Cổng HTTPS 443 không bị chặn)
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="icon-button"
            style={{ color: "#64748b" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Từ Gmail (From)
            </label>
            <select
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                backgroundColor: "white"
              }}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.email}>
                  {acc.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Đến Email (To) *
            </label>
            <input
              type="text"
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              placeholder="nguoinhan@gmail.com, email2@example.com"
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                CC (Tùy chọn)
              </label>
              <input
                type="text"
                value={ccText}
                onChange={(e) => setCcText(e.target.value)}
                placeholder="cc@example.com"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>
                BCC (Tùy chọn)
              </label>
              <input
                type="text"
                value={bccText}
                onChange={(e) => setBccText(e.target.value)}
                placeholder="bcc@example.com"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px"
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Tiêu đề (Subject) *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Nhập tiêu đề thư..."
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
              Nội dung Email (Body)
            </label>
            <textarea
              rows={6}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Nhập nội dung thư tại đây..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "14px",
                fontFamily: "inherit",
                lineHeight: "1.5"
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              className="button button--secondary"
              onClick={onClose}
              disabled={sending}
            >
              Hủy
            </button>

            <button
              type="submit"
              className="button button--primary"
              disabled={sending || !toText.trim() || !subject.trim()}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}
            >
              {sending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              <span>{sending ? "Đang gửi qua Sonjj..." : "Gửi Email ngay"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
