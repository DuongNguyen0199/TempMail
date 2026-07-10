import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtSign,
  ChevronDown,
  Inbox,
  LogOut,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  X
} from "lucide-react";
import { api, ApiClientError } from "./api";
import { AccountsView } from "./components/AccountsView";
import { AuthScreen } from "./components/AuthScreen";
import { InboxView } from "./components/InboxView";
import { SettingsView } from "./components/SettingsView";
import type { GmailAccount, InboxMessage, Pagination, User } from "./types";
import { initials } from "./utils";

type View = "inbox" | "accounts" | "settings";
type Toast = { id: number; message: string; type: "success" | "error" };

const emptyPagination: Pagination = { page: 1, limit: 25, total: 0, pages: 1 };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("inbox");
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 760);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<GmailAccount | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<InboxMessage | null>(null);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [filters, setFilters] = useState({ sender: "", subject: "" });
  const [appliedFilters, setAppliedFilters] = useState({ sender: "", subject: "" });
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchInput, setSearchInput] = useState({ sender: "", subject: "" });
  const [globalSearchActive, setGlobalSearchActive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof ApiClientError && error.status === 401) {
      setUser(null);
      return;
    }
    notify(error instanceof Error ? error.message : "Đã có lỗi xảy ra.", "error");
  }, [notify]);

  const loadAccounts = useCallback(async () => {
    try {
      const result = await api<{ data: GmailAccount[] }>("/gmail/accounts");
      setAccounts(result.data);
      setSelectedAccount((current) => {
        if (!current) return result.data[0] ?? null;
        return result.data.find((item) => item.id === current.id) ?? result.data[0] ?? null;
      });
    } catch (error) {
      handleError(error);
    }
  }, [handleError]);

  useEffect(() => {
    api<{ user: User }>("/me")
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (user) void loadAccounts();
  }, [user, loadAccounts]);

  useEffect(() => {
    if (searchDialogOpen) {
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.value = searchInput.sender;
        if (subjectInputRef.current) subjectInputRef.current.value = searchInput.subject;
      }, 0);
    }
  }, [searchDialogOpen]);

  const loadMessages = useCallback(async (
    account = selectedAccount,
    page = 1,
    activeFilters = appliedFilters
  ) => {
    if (!account) {
      setMessages([]);
      setPagination(emptyPagination);
      return;
    }
    setLoadingMessages(true);
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: "25",
        ...(activeFilters.sender ? { sender: activeFilters.sender } : {}),
        ...(activeFilters.subject ? { subject: activeFilters.subject } : {})
      });
      const result = await api<{ data: InboxMessage[]; pagination: Pagination }>(
        `/gmail/${encodeURIComponent(account.email)}/inbox/search?${query}`
      );
      setMessages(result.data);
      setPagination(result.pagination);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMessages(false);
    }
  }, [selectedAccount, appliedFilters, handleError]);

  const loadAllMessages = useCallback(async (
    page = 1,
    activeFilters = { sender: searchInput.sender, subject: searchInput.subject }
  ) => {
    if (!searchInput.sender && !searchInput.subject) return;
    setLoadingMessages(true);
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: "25",
        ...(activeFilters.sender ? { sender: activeFilters.sender } : {}),
        ...(activeFilters.subject ? { subject: activeFilters.subject } : {})
      });
      const result = await api<{ data: InboxMessage[]; pagination: Pagination }>(
        `/gmail/search-all?${query}`
      );
      setMessages(result.data);
      setPagination(result.pagination);
      setSelectedAccount(null);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMessages(false);
    }
  }, [searchInput, handleError]);

  const handleGlobalSearch = async (sender: string, subject: string) => {
    if (!sender && !subject) return;
    setSearchDialogOpen(false);
    setSearchInput({ sender, subject });
    setGlobalSearchActive(true);
    setView("inbox");
    setLoadingMessages(true);
    try {
      const query = new URLSearchParams({
        page: "1",
        limit: "25",
        ...(sender ? { sender } : {}),
        ...(subject ? { subject } : {})
      });
      const result = await api<{ data: InboxMessage[]; pagination: Pagination }>(
        `/gmail/search-all?${query}`
      );
      setMessages(result.data);
      setPagination(result.pagination);
      setSelectedAccount(null);
    } catch (error) {
      handleError(error);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (user && view === "inbox") void loadMessages(selectedAccount, 1, appliedFilters);
  }, [selectedAccount?.id, user, view, appliedFilters, loadMessages]);

  useEffect(() => {
    if (globalSearchActive && user && view === "inbox") {
      void loadAllMessages(1, { sender: searchInput.sender, subject: searchInput.subject });
    }
  }, [globalSearchActive, searchInput, user, view, loadAllMessages]);

  const addAccount = async (email: string) => {
    setAddingAccount(true);
    try {
      const result = await api<{ account: GmailAccount }>("/gmail/accounts", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      await loadAccounts();
      setSelectedAccount(result.account);
      setView("inbox");
      notify(`Đã thêm Gmail ${result.account.email}.`);
    } catch (error) {
      handleError(error);
    } finally {
      setAddingAccount(false);
    }
  };

  const deleteAccount = async (account: GmailAccount) => {
    if (!window.confirm(`Xóa ${account.email} khỏi danh sách? Inbox đã lưu của email này cũng sẽ bị xóa.`)) return;
    setDeletingEmail(account.email);
    try {
      await api(`/gmail/accounts/${encodeURIComponent(account.email)}`, { method: "DELETE" });
      setSelectedAccount((current) => current?.id === account.id ? null : current);
      setSelectedMessage(null);
      await loadAccounts();
      notify(`Đã xóa ${account.email}.`);
    } catch (error) {
      handleError(error);
    } finally {
      setDeletingEmail(null);
    }
  };

  const syncInbox = async () => {
    if (!selectedAccount) return;
    setSyncingInbox(true);
    try {
      const result = await api<{ synced: number }>(
        `/gmail/${encodeURIComponent(selectedAccount.email)}/inbox/fetch`,
        { method: "POST", body: "{}" }
      );
      await Promise.all([loadMessages(selectedAccount, 1, appliedFilters), loadAccounts()]);
      notify(`Inbox đã cập nhật ${result.synced} message.`);
    } catch (error) {
      handleError(error);
    } finally {
      setSyncingInbox(false);
    }
  };

  const selectMessage = async (summary: InboxMessage, force = false) => {
    setSelectedMessage({ ...summary, isRead: true });
    setMessages((current) => current.map((item) => item.id === summary.id ? { ...item, isRead: true } : item));
    setDetailLoading(true);
    try {
      const path = `/gmail/${encodeURIComponent(summary.email)}/messages/${encodeURIComponent(summary.mid)}`;
      let result = await api<{ message: InboxMessage }>(path);
      if (!result.message.body || force) {
        result = await api<{ message: InboxMessage }>(`${path}/fetch`, { method: "POST", body: "{}" });
      }
      setSelectedMessage(result.message);
    } catch (error) {
      handleError(error);
    } finally {
      setDetailLoading(false);
    }
  };

  const logout = async () => {
    try { await api("/auth/logout", { method: "POST", body: "{}" }); } finally { setUser(null); }
  };

  if (checkingSession) {
    return <div className="app-loading"><span className="brand-mark"><Inbox size={22} /></span><span>Đang mở SmailBox…</span></div>;
  }
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  const switchView = (next: View) => {
    setView(next);
    if (next !== "inbox") setSelectedMessage(null);
  };

  return (
    <div className={`app-shell ${sidebarOpen ? "" : "app-shell--collapsed"}`}>
      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark"><Inbox size={20} /></span>
            <span>SmailBox</span>
          </div>
          <button className="icon-button desktop-only" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={18} /></button>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="main-nav">
          <button className={view === "inbox" ? "active" : ""} onClick={() => switchView("inbox")}>
            <Inbox size={19} /><span>Inbox</span><em>{selectedAccount?._count.messages ?? 0}</em>
          </button>
          <button className={view === "accounts" ? "active" : ""} onClick={() => switchView("accounts")}>
            <AtSign size={19} /><span>Gmail Accounts</span><em>{accounts.length}</em>
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => switchView("settings")}>
            <Settings size={19} /><span>Cài đặt</span>
          </button>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-label">
            <span>Gmail của bạn</span>
            <button title="Thêm Gmail" onClick={() => switchView("accounts")}>
              <Plus size={14} />
            </button>
          </div>
          <div className="account-list">
            {accounts.slice(0, 8).map((account) => (
              <button
                key={account.id}
                className={selectedAccount?.id === account.id && view === "inbox" ? "active" : ""}
                onClick={() => { setSelectedAccount(account); switchView("inbox"); setSidebarOpen(window.innerWidth > 760); }}
              >
                <span className="mini-avatar">{initials(account.email)}</span>
                <span>
                  <strong>{account.email.split("@")[0]}</strong>
                  <small>@{account.email.split("@")[1]}</small>
                </span>
                <em>{account._count.messages}</em>
              </button>
            ))}
            {!accounts.length && <p className="sidebar-empty">Chưa có Gmail. Bấm dấu + để thêm thủ công.</p>}
          </div>
        </div>

        <div className="user-menu">
          <span className="user-avatar">{initials(user.username || user.email)}</span>
          <span><strong>{user.username || "Tài khoản"}</strong><small>{user.email}</small></span>
          <button title="Đăng xuất" onClick={logout}><LogOut size={17} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>}
          <div className="global-search" onClick={() => { setSearchDialogOpen(true); setTimeout(() => searchInputRef.current?.focus(), 100); }}>
            <Search size={18} />
            <input
              placeholder={globalSearchActive ? `Tìm: ${searchInput.sender || searchInput.subject || "..."}` : "Tìm nhanh theo người gửi…"}
              readOnly
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSearchDialogOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }
              }}
            />
            {globalSearchActive && (
              <button
                className="search-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setGlobalSearchActive(false);
                  setSearchInput({ sender: "", subject: "" });
                  setSelectedAccount(accounts[0] ?? null);
                  setView("inbox");
                }}
                title="Xóa tìm kiếm"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {searchDialogOpen && (
            <div className="dialog-overlay" onClick={() => setSearchDialogOpen(false)}>
              <div className="dialog" onClick={(e) => e.stopPropagation()}>
                <div className="dialog-header">
                  <h3>Tìm kiếm nhanh</h3>
                  <button className="icon-button" onClick={() => setSearchDialogOpen(false)}>
                    <X size={18} />
                  </button>
                </div>
                <div className="dialog-content">
                  <label className="dialog-field">
                    <span>Người gửi (Sender)</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Nhập tên hoặc email người gửi"
                      value={searchInput.sender}
                      onChange={(e) => setSearchInput({ ...searchInput, sender: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const senderVal = (e.target as HTMLInputElement).value;
                          const subjectVal = subjectInputRef.current?.value || "";
                          handleGlobalSearch(senderVal, subjectVal);
                        }
                      }}
                    />
                  </label>
                  <label className="dialog-field">
                    <span>Tiêu đề (Subject)</span>
                    <input
                      ref={subjectInputRef}
                      type="text"
                      placeholder="Nhập tiêu đề email"
                      value={searchInput.subject}
                      onChange={(e) => setSearchInput({ ...searchInput, subject: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const senderVal = searchInputRef.current?.value || "";
                          const subjectVal = (e.target as HTMLInputElement).value;
                          handleGlobalSearch(senderVal, subjectVal);
                        }
                      }}
                    />
                  </label>
                  <p className="dialog-hint">
                    Tìm kiếm trên <strong>{accounts.length}</strong> Gmail account{accounts.length !== 1 ? "s" : ""}.
                    Có thể nhập Sender hoặc Subject hoặc cả hai.
                  </p>
                </div>
                <div className="dialog-actions">
                  <button className="button" onClick={() => {
                    setSearchInput({ sender: "", subject: "" });
                    setSearchDialogOpen(false);
                  }}>
                    Hủy
                  </button>
                  <button
                    className="button button--primary"
                    onClick={() => {
                      const senderVal = searchInputRef.current?.value || "";
                      const subjectVal = subjectInputRef.current?.value || "";
                      if (senderVal || subjectVal) {
                        handleGlobalSearch(senderVal, subjectVal);
                      }
                    }}
                    disabled={!(searchInputRef.current?.value || searchInput.sender || subjectInputRef.current?.value || searchInput.subject)}
                  >
                    Tìm kiếm
                  </button>
                </div>
              </div>
            </div>
          )}
          <button className="profile-chip" onClick={() => switchView("settings")}>
            <span>{initials(user.username || user.email)}</span>
            <div><strong>{user.username || "Workspace"}</strong><small>{user.email}</small></div>
            <ChevronDown size={15} />
          </button>
        </header>

        <div className="main-content">
          {view === "inbox" && (
            <InboxView
              account={selectedAccount}
              messages={messages}
              pagination={pagination}
              selected={selectedMessage}
              loading={loadingMessages}
              detailLoading={detailLoading}
              syncing={syncingInbox}
              filters={filters}
              onFiltersChange={setFilters}
              onApplyFilters={() => setAppliedFilters(filters)}
              onClearFilters={() => { setFilters({ sender: "", subject: "" }); setAppliedFilters({ sender: "", subject: "" }); }}
              onSelect={selectMessage}
              onCloseDetail={() => setSelectedMessage(null)}
              onSync={syncInbox}
              onRefreshMessage={() => selectedMessage && selectMessage(selectedMessage, true)}
              onPage={(page) => {
                if (globalSearchActive) {
                  void loadAllMessages(page, { sender: searchInput.sender, subject: searchInput.subject });
                } else {
                  void loadMessages(selectedAccount, page, appliedFilters);
                }
              }}
              globalSearchMode={globalSearchActive}
            />
          )}
          {view === "accounts" && (
            <AccountsView
              accounts={accounts}
              adding={addingAccount}
              deletingEmail={deletingEmail}
              onAdd={addAccount}
              onDelete={deleteAccount}
              onOpen={(account) => { setSelectedAccount(account); switchView("inbox"); }}
            />
          )}
          {view === "settings" && <SettingsView notify={notify} />}
        </div>
      </main>

      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
