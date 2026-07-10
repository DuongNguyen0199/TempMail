import { FormEvent, useState } from "react";
import { AtSign, Plus, Trash2 } from "lucide-react";
import type { GmailAccount } from "../types";

export function AccountsView({
  accounts,
  adding,
  deletingEmail,
  onAdd,
  onDelete,
  onOpen
}: {
  accounts: GmailAccount[];
  adding: boolean;
  deletingEmail: string | null;
  onAdd: (email: string) => Promise<void>;
  onDelete: (account: GmailAccount) => Promise<void>;
  onOpen: (account: GmailAccount) => void;
}) {
  const [email, setEmail] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    await onAdd(value);
    setEmail("");
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

      <form className="account-add-card" onSubmit={submit}>
        <div>
          <h2>Thêm Gmail thủ công</h2>
          <p>Nhập email SmailPro/Sonjj bạn muốn theo dõi. App sẽ không tự lấy danh sách Gmail từ API nữa.</p>
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
          {adding ? "Đang thêm..." : "Thêm Gmail"}
        </button>
      </form>

      {accounts.length === 0 ? (
        <div className="empty-state large-empty">
          <span className="empty-icon"><AtSign size={28} /></span>
          <h2>Chưa có Gmail nào</h2>
          <p>Nhập địa chỉ Gmail ở form bên trên để bắt đầu. API Sonjj chỉ được gọi khi bạn refresh inbox.</p>
        </div>
      ) : (
        <div className="account-grid">
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
