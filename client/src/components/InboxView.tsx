import DOMPurify from "dompurify";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox,
  LoaderCircle,
  MailOpen,
  RefreshCw,
  RotateCw,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import type { GmailAccount, InboxMessage, Pagination } from "../types";
import { formatMessageTime, initials, senderName } from "../utils";

export function InboxView({
  account,
  messages,
  pagination,
  selected,
  loading,
  detailLoading,
  syncing,
  filters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  onSelect,
  onCloseDetail,
  onSync,
  onRefreshMessage,
  onPage,
  globalSearchMode = false
}: {
  account: GmailAccount | null;
  messages: InboxMessage[];
  pagination: Pagination;
  selected: InboxMessage | null;
  loading: boolean;
  detailLoading: boolean;
  syncing: boolean;
  filters: { sender: string; subject: string };
  onFiltersChange: (filters: { sender: string; subject: string }) => void;
  onApplyFilters: () => void;
  onClearFilters: () => void;
  onSelect: (message: InboxMessage) => void;
  onCloseDetail: () => void;
  onSync: () => void;
  onRefreshMessage: () => void;
  onPage: (page: number) => void;
  globalSearchMode?: boolean;
}) {
  if (!account && !globalSearchMode) {
    return (
      <div className="empty-state inbox-empty">
        <span className="empty-icon"><Inbox size={28} /></span>
        <h2>Chọn một Gmail để mở inbox</h2>
        <p>Danh sách tài khoản nằm ở thanh bên trái hoặc trang Gmail Accounts.</p>
      </div>
    );
  }

  return (
    <div className={`mail-workspace ${selected ? "mail-workspace--detail" : ""}`}>
      <section className="message-column">
        <div className="mail-toolbar">
          {globalSearchMode ? (
            <div className="mail-account-title">
              <span className="account-dot"><Search size={18} /></span>
              <div>
                <strong>Kết quả tìm kiếm</strong>
                <span>{pagination.total} messages</span>
              </div>
            </div>
          ) : (
            <div className="mail-account-title">
              <span className="account-dot">{initials(account!.email)}</span>
              <div>
                <strong>{account!.email}</strong>
                <span>{pagination.total} messages</span>
              </div>
            </div>
          )}
          {!globalSearchMode && (
            <button className="icon-button" title="Làm mới inbox" onClick={onSync} disabled={syncing}>
              <RefreshCw size={18} className={syncing ? "spin" : ""} />
            </button>
          )}
        </div>

        <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); onApplyFilters(); }}>
          <label>
            <Search size={16} />
            <input
              value={filters.sender}
              onChange={(event) => onFiltersChange({ ...filters, sender: event.target.value })}
              placeholder="Tìm người gửi"
            />
          </label>
          <label>
            <SlidersHorizontal size={16} />
            <input
              value={filters.subject}
              onChange={(event) => onFiltersChange({ ...filters, subject: event.target.value })}
              placeholder="Lọc tiêu đề"
            />
          </label>
          <button className="button button--compact" type="submit">Lọc</button>
          {(filters.sender || filters.subject) && (
            <button className="filter-clear" type="button" onClick={onClearFilters} title="Xóa bộ lọc">
              <X size={17} />
            </button>
          )}
        </form>

        <div className="message-list">
          {loading ? (
            <div className="loading-state"><LoaderCircle className="spin" /> Đang tải inbox…</div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><MailOpen size={24} /></span>
              <h3>{globalSearchMode ? "Không tìm thấy kết quả" : "Inbox chưa có dữ liệu email nào"}</h3>
              <p>
                {globalSearchMode
                  ? "Thử thay đổi từ khóa tìm kiếm."
                  : "Gmail này mới được tạo hoặc chưa có thư mới gửi tới. Bạn thử bấm nút Refresh bên dưới hoặc kiểm tra API Key Sonjj trong Cài đặt."}
              </p>
              {!globalSearchMode && (
                <button
                  type="button"
                  className="button button--secondary"
                  style={{ marginTop: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  onClick={onSync}
                  disabled={syncing}
                >
                  <RotateCw size={15} className={syncing ? "spin" : ""} />
                  <span>{syncing ? "Đang quét email mới..." : "Quét email ngay (Refresh)"}</span>
                </button>
              )}
            </div>
          ) : messages.map((message) => (
            <button
              className={`message-row ${!message.isRead ? "message-row--unread" : ""} ${selected?.id === message.id ? "message-row--active" : ""}`}
              key={message.id}
              onClick={() => onSelect(message)}
            >
              <span className="sender-avatar">{initials(senderName(message.sender))}</span>
              <span className="message-summary">
                <span className="message-meta">
                  <strong>{senderName(message.sender)}</strong>
                  <time>{formatMessageTime(message.receivedAt)}</time>
                </span>
                <span className="message-subject">{message.subject || "(Không có tiêu đề)"}</span>
                <span className="message-snippet">{message.snippet || "Mở để xem nội dung message"}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="pagination">
          <span>Trang {pagination.page} / {pagination.pages}</span>
          <div>
            <button className="icon-button" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
              <ChevronLeft size={17} />
            </button>
            <button className="icon-button" disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      <section className="reader-column">
        {!selected ? (
          <div className="reader-placeholder">
            <span><MailOpen size={30} /></span>
            <h3>Chọn một message để đọc</h3>
            <p>Nội dung sẽ được tải và lưu cache tại đây.</p>
          </div>
        ) : (
          <>
            <div className="reader-toolbar">
              <button className="icon-button reader-back" onClick={onCloseDetail}><ArrowLeft size={18} /></button>
              <span>Nội dung message</span>
              <button className="icon-button" title="Tải lại message" onClick={onRefreshMessage} disabled={detailLoading}>
                <RotateCw size={17} className={detailLoading ? "spin" : ""} />
              </button>
            </div>
            <article className="reader-content">
              <h1>{selected.subject || "(Không có tiêu đề)"}</h1>
              <div className="reader-sender">
                <span className="sender-avatar sender-avatar--large">{initials(senderName(selected.sender))}</span>
                <div>
                  <strong>{senderName(selected.sender)}</strong>
                  <span>{selected.sender || "Không rõ địa chỉ người gửi"}</span>
                </div>
                <time>{formatMessageTime(selected.receivedAt)}</time>
              </div>
              {detailLoading ? (
                <div className="loading-state reader-loading"><LoaderCircle className="spin" /> Đang tải nội dung…</div>
              ) : selected.body ? (
                <div
                  className="email-body"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selected.body, {
                      USE_PROFILES: { html: true },
                      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
                      FORBID_ATTR: ["onerror", "onload", "onclick"]
                    })
                  }}
                />
              ) : (
                <div className="empty-body">
                  <p>Message chưa có nội dung được lưu.</p>
                  <button className="button button--primary" onClick={onRefreshMessage}>Tải message</button>
                </div>
              )}
            </article>
          </>
        )}
      </section>
    </div>
  );
}
