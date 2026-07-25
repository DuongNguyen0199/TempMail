import { useState } from "react";
import { ArrowRight, ArrowLeft, Inbox, KeyRound, Layers3, ShieldCheck, MailCheck } from "lucide-react";
import { api } from "../api";
import type { User } from "../types";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitForm = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    if (mode === "login") {
      try {
        const result = await api<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        onAuthenticated(result.user);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Đăng nhập thất bại.");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Register flow: Request OTP
    try {
      const res = await api<{ requiresOtp?: boolean; message?: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, username })
      });

      if (res.requiresOtp) {
        setOtpMessage(res.message || "Mã OTP đã được gửi tới Admin (duongrbt@gmail.com). Vui lòng liên hệ Admin để lấy mã.");
        setStep("otp");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Yêu cầu đăng ký thất bại.");
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError("Vui lòng nhập đúng 6 chữ số mã OTP.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const result = await api<{ user: User }>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otpCode: otpCode.trim() })
      });
      onAuthenticated(result.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Xác thực OTP thất bại.");
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
        {step === "form" ? (
          <form className="auth-card" onSubmit={submitForm}>
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
                  : "Đăng ký yêu cầu mã OTP xác thực từ Admin (duongrbt@gmail.com)."}
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
              {loading ? "Đang xử lý…" : mode === "login" ? "Vào workspace" : "Tiếp tục (Yêu cầu OTP Admin)"}
              {!loading && <ArrowRight size={18} />}
            </button>
            <p className="auth-switch">
              {mode === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
              <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
                {mode === "login" ? "Đăng ký" : "Đăng nhập"}
              </button>
            </p>
          </form>
        ) : (
          <form className="auth-card" onSubmit={submitOtp}>
            <div className="mobile-brand brand">
              <span className="brand-mark"><Inbox size={20} /></span>
              <span>SmailBox</span>
            </div>
            <div>
              <span className="eyebrow" style={{ color: "#4f46e5" }}>Xác thực tài khoản</span>
              <h2>Nhập mã OTP từ Admin</h2>
              <p className="muted" style={{ fontSize: "13px", lineHeight: "1.5" }}>
                {otpMessage}
              </p>
            </div>

            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: "1.5" }}>
                📩 Hãy liên hệ Admin <strong>duongrbt@gmail.com</strong> để lấy mã xác thực 6 chữ số.
              </p>
            </div>

            <label>
              Mã OTP 6 chữ số
              <input
                type="text"
                value={otpCode}
                onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Ví dụ: 482915"
                maxLength={6}
                style={{ fontSize: "20px", letterSpacing: "4px", textAlign: "center", fontWeight: 700 }}
                required
              />
            </label>

            {error && <div className="form-error">{error}</div>}

            <button className="button button--primary button--wide" disabled={loading || otpCode.length !== 6}>
              <MailCheck size={18} style={{ marginRight: "6px" }} />
              {loading ? "Đang xác thực OTP…" : "Xác nhận OTP & Tạo tài khoản"}
            </button>

            <button
              type="button"
              className="button button--secondary button--wide"
              style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              onClick={() => { setStep("form"); setError(""); }}
            >
              <ArrowLeft size={16} /> Quản lại form đăng ký
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
