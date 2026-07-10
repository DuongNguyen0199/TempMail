import { useState } from "react";
import { ArrowRight, Inbox, KeyRound, Layers3, ShieldCheck } from "lucide-react";
import { api } from "../api";
import type { User } from "../types";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await api<{ user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password, ...(mode === "register" ? { username } : {}) })
      });
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <div className="brand brand--light">
          <span className="brand-mark"><Inbox size={22} /></span>
          <span>SmailBox</span>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">Gmail workspace của riêng bạn</span>
          <h1>Mọi inbox tạm thời.<br />Một nơi để đọc.</h1>
          <p>
            Đồng bộ Gmail từ Sonjj/SmailPro, tìm đúng email cần thiết và giữ dữ liệu
            tách biệt an toàn cho từng thành viên.
          </p>
        </div>
        <div className="feature-row">
          <div><Layers3 size={20} /><span>Inbox tập trung</span></div>
          <div><KeyRound size={20} /><span>API key mã hóa</span></div>
          <div><ShieldCheck size={20} /><span>Dữ liệu riêng tư</span></div>
        </div>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="mobile-brand brand">
            <span className="brand-mark"><Inbox size={20} /></span>
            <span>SmailBox</span>
          </div>
          <div>
            <span className="eyebrow">{mode === "login" ? "Chào mừng trở lại" : "Bắt đầu ngay"}</span>
            <h2>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
            <p className="muted">
              {mode === "login"
                ? "Mở workspace và tiếp tục từ nơi bạn dừng lại."
                : "Tạo workspace inbox riêng trong vài giây."}
            </p>
          </div>

          {mode === "register" && (
            <label>
              Tên hiển thị
              <input
                autoComplete="name"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Nguyễn Minh"
                minLength={2}
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ban@example.com"
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              minLength={8}
              required
            />
          </label>

          {error && <div className="form-error">{error}</div>}
          <button className="button button--primary button--wide" disabled={loading}>
            {loading ? "Đang xử lý…" : mode === "login" ? "Vào workspace" : "Tạo tài khoản"}
            {!loading && <ArrowRight size={18} />}
          </button>
          <p className="auth-switch">
            {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}
