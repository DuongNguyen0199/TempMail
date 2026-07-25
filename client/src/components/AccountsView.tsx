import { FormEvent, useState } from "react";
import { AtSign, ListPlus, Plus, Trash2 } from "lucide-react";
import type { GmailAccount } from "../types";

export function AccountsView({
  accounts,
  adding,
  deletingEmail,
  onAdd,
  onAddBulk,
  onDelete,
  onOpen
}: {
  accounts: GmailAccount[];
  adding: boolean;
  deletingEmail: string | null;
  onAdd: (email: string) => Promise<void>;
  onAddBulk: (emailsText: string) => Promise<void>;
  onDelete: (account: GmailAccount) => Promise<void>;
  onOpen: (account: GmailAccount) => void;
}) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [bulkText, setBulkText] = useState("");

  const submitSingle = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    await onAdd(value);
    setEmail("");
  };

  const submitBulk = async (event: FormEvent) => {
    event.preventDefault();
    const value = bulkText.trim();
    if (!value) return;
    await onAddBulk(value);
    setBulkText("");
  };

  return (
    <div className="content-page accounts-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Nguồn thư</span>
          <h1>Gmail Accounts</h1>
          <p>{accounts.length} địa chỉ đang được lưu trong workspace của bạn.</p>
        </div>
      </div>

      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: "14px 16px", borderRadius: "10px", color: "#1e40af", fontSize: "13px", lineHeight: "1.6", marginBottom: "20px" }}>
        💡 <strong>Lưu ý về Nguồn dữ liệu Sonjj / SmailPro API:</strong>
        <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
          <li>
            API của <strong>Sonjj / SmailPro</strong> chỉ hỗ trợ đọc thư tự động cho <strong>các tài khoản Gmail ảo/tạm thời</strong> được mua hoặc khởi tạo qua hệ thống Sonjj (ví dụ: <code>louellagonzale.z1201.5@gmail.com</code>).
          </li>
          <li>
            Nếu bạn thêm một <strong>Gmail cá nhân bên ngoài</strong> (như <code>duongrbt1@gmail.com</code> hoặc <code>duongrbt@gmail.com</code>), máy chủ Sonjj API sẽ không sở hữu hòm thư cá nhân này nên không thể đọc dữ liệu từ Google về được.
          </li>
        </ul>
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
        <button
          type="button"
          className={`button ${mode === "single" ? "button--primary" : "button--secondary"}`}
          onClick={() => setMode("single")}
        >
          <Plus size={16} style={{ marginRight: "6px" }} /> Thêm 1 Gmail
        </button>
        <button
          type="button"
          className={`button ${mode === "bulk" ? "button--primary" : "button--secondary"}`}
          onClick={() => setMode("bulk")}
        >
          <ListPlus size={16} style={{ marginRight: "6px" }} /> Thêm hàng loạt Gmail (Bulk Insert)
        </button>
      </div>

      {mode === "single" ? (
        <form className="account-add-card" onSubmit={submitSingle}>
          <div>
            <h2>Thêm 1 Gmail thủ công</h2>
            <p>Nhập địa chỉ Gmail bạn muốn quét. Hệ thống sẽ tự động lọc mail tiêu đề "OutSystems".</p>
          </div>
          <label>
            Địa chỉ Gmail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="example@gmail.com"
              autoComplete="off"
            />
          </label>
          <button className="button button--primary" disabled={adding || !email.trim()}>
            <Plus size={17} />
            {adding ? "Đang thêm & quét..." : "Thêm Gmail"}
          </button>
        </form>
      ) : (
        <form className="account-add-card" onSubmit={submitBulk} style={{ flexDirection: "column", alignItems: "stretch" }}>
          <div>
            <h2>Thêm hàng loạt Gmail (Bulk Insert)</h2>
            <p>Dán danh sách nhiều địa chỉ Gmail (Mỗi dòng 1 email). Hệ thống sẽ tự động nhận diện và quét ngay!</p>
          </div>
          <label style={{ width: "100%", marginTop: "10px" }}>
            Danh sách Gmail (Mỗi email 1 dòng)
            <textarea
              rows={6}
              value={bulkText}
              onChange={(event) => setBulkText(event.target.value)}
              placeholder={"craigell.mr141.9.9.2@gmail.com\nkittyhaye.s7.6.234@gmail.com\nrosemaryholl.an.d.2.2312@gmail.com"}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "6px",
                border: "1px solid var(--color-border, #ccc)",
                fontFamily: "monospace",
                fontSize: "13px",
                marginTop: "6px"
              }}
            />
          </label>
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
            <button className="button button--primary" disabled={adding || !bulkText.trim()}>
              <ListPlus size={17} style={{ marginRight: "6px" }} />
              {adding ? "Đang thêm & quét hàng loạt..." : "Thêm hàng loạt Gmail ngay"}
            </button>
          </div>
        </form>
      )}

      {accounts.length === 0 ? (
        <div className="empty-state large-empty">
          <span className="empty-icon"><AtSign size={28} /></span>
          <h2>Chưa có Gmail nào</h2>
          <p>Nhập địa chỉ Gmail ở form bên trên để bắt đầu theo dõi và chuyển tiếp tự động.</p>
        </div>
      ) : (
        <div className="account-grid" style={{ marginTop: "20px" }}>
          {accounts.map((account) => (
            <div key={account.id} className="account-card account-card--manual">
              <button className="account-card__open" onClick={() => onOpen(account)}>
                <span className="account-avatar"><AtSign size={21} /></span>
                <span className="account-main">
                  <strong>{account.email}</strong>
                  <span>{account.type || "manual"} · {account._count.messages} messages</span>
                </span>
                <span className="account-open">Mở inbox →</span>
              </button>
              <button
                className="icon-button icon-button--danger"
                title="Xóa Gmail khỏi danh sách"
                disabled={deletingEmail === account.email}
                onClick={() => onDelete(account)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
