import { useEffect, useState } from "react";
import { Check, Clock3, Eye, EyeOff, KeyRound, Mail, Play, Send, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../api";
import type { AutoForwardConfig } from "../types";

type Config = {
  configured: boolean;
  maskedKey: string | null;
  updatedAt: string | null;
};

type InboxConfig = {
  inboxTimestamp: string;
};

function timestampToDatetimeInput(timestamp: string) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function datetimeInputToTimestamp(datetime: string) {
  if (!datetime) return 0;

  const time = new Date(datetime).getTime();
  if (Number.isNaN(time)) return null;

  return Math.floor(time / 1000);
}

export function SettingsView({ notify }: { notify: (message: string, type?: "success" | "error") => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inboxTimestamp, setInboxTimestamp] = useState("0");
  const [inboxDatetime, setInboxDatetime] = useState("");
  const [savingTimestamp, setSavingTimestamp] = useState(false);

  // Auto Forward states
  const [autoForwardConfig, setAutoForwardConfig] = useState<AutoForwardConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [targetEmail, setTargetEmail] = useState("duongrbt@gmail.com");
  const [subjectsText, setSubjectsText] = useState(
    "OutSystems Certification Voucher\nThank you for being part of the OutSystems Referral Program!"
  );
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [visibleSmtpPass, setVisibleSmtpPass] = useState(false);
  const [savingForward, setSavingForward] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);

  const load = async () => {
    try {
      const [apiConfig, inboxConfig, forwardConfig] = await Promise.all([
        api<Config>("/profile/api-config"),
        api<InboxConfig>("/profile/inbox-config"),
        api<AutoForwardConfig>("/profile/auto-forward")
      ]);
      setConfig(apiConfig);
      setInboxTimestamp(inboxConfig.inboxTimestamp);
      setInboxDatetime(timestampToDatetimeInput(inboxConfig.inboxTimestamp));

      if (forwardConfig) {
        setAutoForwardConfig(forwardConfig);
        setEnabled(forwardConfig.enabled);
        setTargetEmail(forwardConfig.targetEmail || "duongrbt@gmail.com");
        setSubjectsText((forwardConfig.subjects || []).join("\n"));
        setSmtpHost(forwardConfig.smtpHost || "smtp.gmail.com");
        setSmtpPort(forwardConfig.smtpPort || 587);
        setSmtpSecure(forwardConfig.smtpSecure || false);
        setSmtpUser(forwardConfig.smtpUser || "");
      }
    } catch (err) {
      console.error(err);
    }
  };
  useEffect(() => { void load(); }, []);

  const test = async () => {
    if (!apiKey.trim()) return notify("Nhập API key mới để kiểm tra.", "error");
    setTesting(true);
    try {
      await api("/profile/api-config/test", { method: "POST", body: JSON.stringify({ apiKey }) });
      notify("API key hợp lệ và có thể kết nối Sonjj.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể kiểm tra API key.", "error");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!apiKey.trim()) return notify("API key không được để trống.", "error");
    setSaving(true);
    try {
      const result = await api<Config>("/profile/api-config", {
        method: "POST",
        body: JSON.stringify({ apiKey })
      });
      setConfig(result);
      setApiKey("");
      notify("Đã mã hóa và lưu API key.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu API key.", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Xóa API key đã lưu? Các inbox trong database vẫn được giữ lại.")) return;
    try {
      await api("/profile/api-config", { method: "DELETE" });
      setConfig({ configured: false, maskedKey: null, updatedAt: null });
      notify("Đã xóa API key.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể xóa API key.", "error");
    }
  };

  const saveTimestamp = async () => {
    if (!inboxTimestamp.trim()) {
      notify("Vui lòng chọn datetime hợp lệ hoặc để trống để dùng timestamp 0.", "error");
      return;
    }

    const value = Number(inboxTimestamp);
    if (!Number.isInteger(value) || value < 0) {
      notify("Timestamp phải là số nguyên >= 0.", "error");
      return;
    }
    setSavingTimestamp(true);
    try {
      const result = await api<InboxConfig>("/profile/inbox-config", {
        method: "PUT",
        body: JSON.stringify({ inboxTimestamp: value })
      });
      setInboxTimestamp(result.inboxTimestamp);
      setInboxDatetime(timestampToDatetimeInput(result.inboxTimestamp));
      notify("Đã lưu timestamp fetch inbox.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu timestamp.", "error");
    } finally {
      setSavingTimestamp(false);
    }
  };

  const changeInboxDatetime = (datetime: string) => {
    setInboxDatetime(datetime);

    const timestamp = datetimeInputToTimestamp(datetime);
    if (timestamp === null) {
      setInboxTimestamp("");
      return;
    }

    setInboxTimestamp(String(timestamp));
  };

  const saveForward = async () => {
    setSavingForward(true);
    try {
      const subjects = subjectsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await api<AutoForwardConfig>("/profile/auto-forward", {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          targetEmail,
          subjects,
          smtpHost,
          smtpPort,
          smtpSecure,
          smtpUser,
          ...(smtpPass ? { smtpPass } : {})
        })
      });
      setAutoForwardConfig(result);
      setSmtpPass("");
      notify("Đã lưu cấu hình tự động gửi email.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể lưu cấu hình gửi mail.", "error");
    } finally {
      setSavingForward(false);
    }
  };

  const testSmtp = async () => {
    setTestingSmtp(true);
    try {
      const res = await api<{ message: string }>("/profile/auto-forward/test-smtp", {
        method: "POST",
        body: JSON.stringify({
          targetEmail,
          smtpHost,
          smtpPort,
          smtpSecure,
          smtpUser,
          ...(smtpPass ? { smtpPass } : {})
        })
      });
      notify(res.message);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Không thể gửi email kiểm tra.", "error");
    } finally {
      setTestingSmtp(false);
    }
  };

  const runBatchNow = async () => {
    setRunningBatch(true);
    try {
      const res = await api<{ count: number; status: string; detail?: string }>("/profile/auto-forward/run-now", {
        method: "POST"
      });
      if (res.status === "disabled") {
        notify("Tính năng gửi email tự động đang TẮT.", "error");
      } else if (res.detail) {
        notify(res.detail, res.count > 0 ? "success" : "error");
      } else if (res.count > 0) {
        notify(`Hoàn tất batch! Đã gửi thành công ${res.count} email khớp từ khóa.`);
      } else {
        notify("Batch đã hoàn tất. Không có email mới nào khớp từ khóa cần gửi.");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Đã có lỗi xảy ra khi chạy batch.", "error");
    } finally {
      setRunningBatch(false);
    }
  };

  return (
    <div className="content-page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Hồ sơ & tích hợp</span>
          <h1>Cài đặt tài khoản</h1>
          <p>Kết nối Sonjj/SmailPro để đồng bộ Gmail và cấu hình tự động chuyển tiếp email.</p>
        </div>
      </div>

      {/* Auto Forward Section */}
      <section className="settings-card">
        <div className="settings-card__icon"><Mail size={23} /></div>
        <div className="settings-card__body">
          <div className="settings-title-row">
            <div>
              <h2>Tự động gửi email theo Subject (Batch 30 phút)</h2>
              <p>Tự động quét inbox mỗi 30 phút và gửi email khớp tiêu đề sang hòm thư chỉ định.</p>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "#4f46e5" }}
              />
              {enabled ? "Đang BẬT" : "Đang TẮT"}
            </label>
          </div>

          <label className="key-field">
            Email nhận chuyển tiếp (Target Email)
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              placeholder="duongrbt@gmail.com"
            />
          </label>

          <label className="key-field">
            Danh sách Subject lọc (Mỗi tiêu đề 1 dòng)
            <textarea
              rows={3}
              value={subjectsText}
              onChange={(e) => setSubjectsText(e.target.value)}
              placeholder="OutSystems Certification Voucher&#10;Thank you for being part of the OutSystems Referral Program!"
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "6px",
                border: "1px solid var(--color-border, #ccc)",
                fontFamily: "inherit",
                fontSize: "14px"
              }}
            />
          </label>

          <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, marginBottom: "10px" }}>Cấu hình SMTP gửi mail</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <label className="key-field">
                SMTP Host
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                />
              </label>
              <label className="key-field">
                SMTP Port
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  placeholder="587"
                />
              </label>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
              <label className="key-field">
                SMTP User / Email gửi
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder="your-email@gmail.com"
                />
              </label>

              <label className="key-field">
                SMTP Password / App Password {autoForwardConfig?.smtpPassConfigured && "(Đã lưu)"}
                <div className="input-with-action">
                  <input
                    type={visibleSmtpPass ? "text" : "password"}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    placeholder={autoForwardConfig?.smtpPassConfigured ? "Đã lưu (nhập mới nếu đổi)" : "Nhập Mật khẩu ứng dụng"}
                  />
                  <button type="button" onClick={() => setVisibleSmtpPass(!visibleSmtpPass)}>
                    {visibleSmtpPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", fontSize: "14px" }}>
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              Bật SSL/TLS Secure (Thường cho Port 465, Port 587 bỏ chọn)
            </label>
          </div>

          <div className="button-row" style={{ marginTop: "20px" }}>
            <button className="button button--primary" onClick={saveForward} disabled={savingForward}>
              {savingForward ? "Đang lưu..." : "Lưu cấu hình"}
            </button>
            <button className="button button--secondary" onClick={testSmtp} disabled={testingSmtp}>
              <Send size={16} style={{ marginRight: "6px" }} />
              {testingSmtp ? "Đang gửi thử..." : "Gửi thử email SMTP"}
            </button>
            <button className="button button--secondary" onClick={runBatchNow} disabled={runningBatch}>
              <Play size={16} style={{ marginRight: "6px" }} />
              {runningBatch ? "Đang xử lý..." : "Chạy Batch ngay"}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__icon"><KeyRound size={23} /></div>
        <div className="settings-card__body">
          <div className="settings-title-row">
            <div>
              <h2>Sonjj API key</h2>
              <p>Key được mã hóa AES-256-GCM trước khi lưu vào database.</p>
            </div>
            <span className={`status-pill ${config?.configured ? "status-pill--ok" : ""}`}>
              {config?.configured ? <><Check size={14} /> Đã kết nối</> : "Chưa cấu hình"}
            </span>
          </div>

          {config?.configured && (
            <div className="saved-key">
              <div>
                <span>Key đang dùng</span>
                <code>{config.maskedKey}</code>
              </div>
              <button className="icon-button icon-button--danger" title="Xóa API key" onClick={remove}>
                <Trash2 size={18} />
              </button>
            </div>
          )}

          <label className="key-field">
            {config?.configured ? "Thay API key" : "API key"}
            <div className="input-with-action">
              <input
                type={visible ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Dán X-Api-Key từ my.sonjj.com"
                autoComplete="off"
              />
              <button type="button" onClick={() => setVisible(!visible)} title={visible ? "Ẩn key" : "Hiện key"}>
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <div className="button-row">
            <button className="button button--secondary" onClick={test} disabled={testing || !apiKey}>
              {testing ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
            </button>
            <button className="button button--primary" onClick={save} disabled={saving || !apiKey}>
              {saving ? "Đang lưu…" : "Lưu API key"}
            </button>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card__icon"><Clock3 size={23} /></div>
        <div className="settings-card__body">
          <div className="settings-title-row">
            <div>
              <h2>Timestamp lấy inbox</h2>
              <p>Giá trị này sẽ được truyền vào Sonjj khi bạn bấm refresh inbox.</p>
            </div>
          </div>

          <label className="key-field">
            Chọn ngày giờ bắt đầu lấy inbox
            <input
              type="datetime-local"
              value={inboxDatetime}
              onChange={(event) => changeInboxDatetime(event.target.value)}
            />
          </label>

          <label className="key-field timestamp-output">
            Timestamp tự động
            <input value={inboxTimestamp || "0"} readOnly />
          </label>

          <div className="timestamp-help">
            <strong>Gợi ý:</strong> để trống ngày giờ nếu muốn lưu <code>0</code> và lấy từ mốc thời gian đầu tiên API cho phép.
            Khi bạn chọn datetime, hệ thống sẽ tự convert sang Unix timestamp dạng giây.
          </div>

          <div className="button-row">
            <button className="button button--primary" onClick={saveTimestamp} disabled={savingTimestamp}>
              {savingTimestamp ? "Đang lưu..." : "Lưu timestamp"}
            </button>
          </div>
        </div>
      </section>

      <div className="security-note">
        <ShieldCheck size={21} />
        <div>
          <strong>Thiết kế ưu tiên bảo mật</strong>
          <p>API key và Mật khẩu SMTP không bao giờ được trả lại nguyên văn cho trình duyệt hoặc ghi vào log.</p>
        </div>
      </div>
    </div>
  );
}

