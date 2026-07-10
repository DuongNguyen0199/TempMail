import { useEffect, useState } from "react";
import { Check, Clock3, Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../api";

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

  const load = async () => {
    const [apiConfig, inboxConfig] = await Promise.all([
      api<Config>("/profile/api-config"),
      api<InboxConfig>("/profile/inbox-config")
    ]);
    setConfig(apiConfig);
    setInboxTimestamp(inboxConfig.inboxTimestamp);
    setInboxDatetime(timestampToDatetimeInput(inboxConfig.inboxTimestamp));
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

  return (
    <div className="content-page settings-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Hồ sơ & tích hợp</span>
          <h1>Cài đặt tài khoản</h1>
          <p>Kết nối Sonjj/SmailPro để đồng bộ Gmail của riêng bạn.</p>
        </div>
      </div>

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
          <p>API key không bao giờ được trả lại nguyên văn cho trình duyệt hoặc ghi vào fetch log.</p>
        </div>
      </div>
    </div>
  );
}
