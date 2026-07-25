import dns from "node:dns";
import axios from "axios";
import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { logFetch } from "./fetch-log.service.js";
import { listAccounts, syncInbox, syncMessage } from "./gmail.service.js";

dns.setDefaultResultOrder?.("ipv4first");

function customIpv4Lookup(hostname: string, options: any, callback: any) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { family: 4, all: false }, (err, address, family) => {
    if (err || !address) {
      return dns.lookup(hostname, options, callback);
    }
    callback(null, address, 4);
  });
}

export const DEFAULT_OUTSYSTEMS_SUBJECTS = [
  "OutSystems Certification Voucher",
  "Thank you for being part of the OutSystems Referral Program!"
];

export const DEFAULT_TARGET_EMAIL = "duongrbt@gmail.com";

export interface SaveAutoForwardInput {
  enabled?: boolean;
  targetEmail?: string;
  subjects?: string[];
  mailProvider?: "smtp" | "resend" | "brevo";
  fromEmail?: string;
  apiSecret?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
}

export async function getOrCreateAutoForwardConfig(userId: string) {
  let config = await prisma.autoForwardConfig.findUnique({
    where: { userId }
  });

  if (!config) {
    config = await prisma.autoForwardConfig.create({
      data: {
        userId,
        enabled: true,
        targetEmail: DEFAULT_TARGET_EMAIL,
        subjectsJson: JSON.stringify(DEFAULT_OUTSYSTEMS_SUBJECTS),
        mailProvider: "smtp",
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpSecure: false
      }
    });
  }

  let subjects: string[] = DEFAULT_OUTSYSTEMS_SUBJECTS;
  try {
    subjects = JSON.parse(config.subjectsJson);
  } catch {
    subjects = DEFAULT_OUTSYSTEMS_SUBJECTS;
  }

  const hasPass = Boolean(config.smtpPassEncrypted);
  const hasApiSecret = Boolean(config.apiSecretEncrypted);

  return {
    enabled: config.enabled,
    targetEmail: config.targetEmail,
    subjects,
    mailProvider: config.mailProvider || "smtp",
    fromEmail: config.fromEmail || "",
    apiSecretConfigured: hasApiSecret,
    smtpHost: config.smtpHost || "smtp.gmail.com",
    smtpPort: config.smtpPort || 587,
    smtpSecure: config.smtpSecure || false,
    smtpUser: config.smtpUser || "",
    smtpPassConfigured: hasPass,
    updatedAt: config.updatedAt
  };
}

export async function saveAutoForwardConfig(userId: string, input: SaveAutoForwardInput) {
  const current = await getOrCreateAutoForwardConfig(userId);

  const enabled = input.enabled ?? current.enabled;
  const targetEmail = input.targetEmail?.trim() || current.targetEmail;
  const subjects = input.subjects && input.subjects.length > 0 ? input.subjects : current.subjects;
  const mailProvider = input.mailProvider || current.mailProvider;
  const fromEmail = input.fromEmail?.trim() ?? current.fromEmail;
  const smtpHost = input.smtpHost?.trim() ?? current.smtpHost;
  const smtpPort = input.smtpPort ?? current.smtpPort;
  const smtpSecure = input.smtpSecure ?? current.smtpSecure;
  const smtpUser = input.smtpUser?.trim() ?? current.smtpUser;

  let smtpPassEncrypted: string | undefined = undefined;
  if (input.smtpPass && input.smtpPass.trim()) {
    smtpPassEncrypted = encryptSecret(input.smtpPass.trim());
  }

  let apiSecretEncrypted: string | undefined = undefined;
  if (input.apiSecret && input.apiSecret.trim()) {
    apiSecretEncrypted = encryptSecret(input.apiSecret.trim());
  }

  await prisma.autoForwardConfig.update({
    where: { userId },
    data: {
      enabled,
      targetEmail,
      subjectsJson: JSON.stringify(subjects),
      mailProvider,
      fromEmail,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      ...(smtpPassEncrypted !== undefined ? { smtpPassEncrypted } : {}),
      ...(apiSecretEncrypted !== undefined ? { apiSecretEncrypted } : {})
    }
  });

  return getOrCreateAutoForwardConfig(userId);
}

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmailMessage(userId: string, options: EmailOptions, overrideParams?: SaveAutoForwardInput) {
  const dbConfig = await prisma.autoForwardConfig.findUnique({
    where: { userId }
  });

  const provider = overrideParams?.mailProvider || dbConfig?.mailProvider || "smtp";
  const targetEmail = overrideParams?.targetEmail?.trim() || dbConfig?.targetEmail || DEFAULT_TARGET_EMAIL;

  let apiSecret: string | undefined = undefined;
  if (overrideParams?.apiSecret && overrideParams.apiSecret.trim()) {
    apiSecret = overrideParams.apiSecret.trim();
  } else if (dbConfig?.apiSecretEncrypted) {
    apiSecret = decryptSecret(dbConfig.apiSecretEncrypted);
  }

  const fromEmail = overrideParams?.fromEmail?.trim() || dbConfig?.fromEmail || overrideParams?.smtpUser?.trim() || dbConfig?.smtpUser || "onboarding@resend.dev";

  // Provider 1: Resend HTTP API (Port 443 HTTPS - Never blocked)
  if (provider === "resend") {
    if (!apiSecret) {
      throw new ApiError(400, "Vui lòng nhập API Key Resend (dạng re_xxxx).", "RESEND_KEY_REQUIRED");
    }
    console.log(`[AutoForward] Sending email via Resend HTTP API to ${targetEmail}...`);
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: fromEmail.includes("<") ? fromEmail : `SmailBox <${fromEmail}>`,
          to: [targetEmail],
          subject: options.subject,
          text: options.text,
          html: options.html
        },
        {
          headers: {
            Authorization: `Bearer ${apiSecret}`,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }
      );
      console.log(`[AutoForward] Sent successfully via Resend HTTP API.`);
      return { success: true, provider: "resend" };
    } catch (err: any) {
      console.error("[AutoForward] Resend API Error:", err?.response?.data || err?.message);
      const resendErr = err?.response?.data?.message || err?.message || "Lỗi gửi Resend API";
      throw new ApiError(400, `Lỗi Resend HTTP API: ${resendErr}`, "RESEND_API_ERROR");
    }
  }

  // Provider 2: Brevo HTTP API (Port 443 HTTPS - Never blocked)
  if (provider === "brevo") {
    if (!apiSecret) {
      throw new ApiError(400, "Vui lòng nhập API Key Brevo.", "BREVO_KEY_REQUIRED");
    }
    console.log(`[AutoForward] Sending email via Brevo HTTP API to ${targetEmail}...`);
    try {
      await axios.post(
        "https://api.brevo.com/v3/smtp/email",
        {
          sender: { email: fromEmail.replace(/.*<|>/g, "") || "no-reply@smailbox.local", name: "SmailBox" },
          to: [{ email: targetEmail }],
          subject: options.subject,
          textContent: options.text,
          htmlContent: options.html
        },
        {
          headers: {
            "api-key": apiSecret,
            "Content-Type": "application/json"
          },
          timeout: 15000
        }
      );
      console.log(`[AutoForward] Sent successfully via Brevo HTTP API.`);
      return { success: true, provider: "brevo" };
    } catch (err: any) {
      console.error("[AutoForward] Brevo API Error:", err?.response?.data || err?.message);
      const brevoErr = err?.response?.data?.message || err?.message || "Lỗi gửi Brevo API";
      throw new ApiError(400, `Lỗi Brevo HTTP API: ${brevoErr}`, "BREVO_API_ERROR");
    }
  }

  // Provider 3: Traditional SMTP (TCP 587/465)
  const host = overrideParams?.smtpHost?.trim() || dbConfig?.smtpHost || "smtp.gmail.com";
  const port = overrideParams?.smtpPort || dbConfig?.smtpPort || 587;
  const secure = port === 465 ? true : (overrideParams?.smtpSecure ?? dbConfig?.smtpSecure ?? false);
  const user = overrideParams?.smtpUser?.trim() || dbConfig?.smtpUser || "";

  let pass: string | undefined = undefined;
  if (overrideParams?.smtpPass && overrideParams.smtpPass.trim()) {
    pass = overrideParams.smtpPass.trim();
  } else if (dbConfig?.smtpPassEncrypted) {
    pass = decryptSecret(dbConfig.smtpPassEncrypted);
  }

  if (!user || !pass) {
    throw new ApiError(
      400,
      "Vui lòng nhập đầy đủ SMTP User và Mật khẩu ứng dụng (App Password) để kết nối.",
      "SMTP_CREDENTIALS_REQUIRED"
    );
  }

  console.log(`[AutoForward] Creating SMTP transporter for ${user} via ${host}:${port} (secure: ${secure}, IPv4 forced)...`);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    lookup: customIpv4Lookup,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  } as any);

  try {
    await transporter.sendMail({
      from: `SmailBox AutoForward <${user}>`,
      to: targetEmail,
      subject: options.subject,
      text: options.text,
      html: options.html
    });
    console.log(`[AutoForward] Sent successfully via SMTP.`);
    return { success: true, provider: "smtp" };
  } catch (error: any) {
    console.error("[AutoForward] SMTP Test Failed:", error);
    let errorMsg = error?.message || "Không thể kết nối đến máy chủ SMTP";
    if (errorMsg.includes("ENETUNREACH") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
      errorMsg = `Render/Mạng chặn cổng SMTP ${port}. Hãy chuyển sang dùng Resend HTTP API (Miễn phí, Port 443 không bị chặn) hoặc dùng VPS.`;
    } else if (errorMsg.includes("535") || errorMsg.includes("Username and Password not accepted")) {
      errorMsg = "Mật khẩu SMTP không đúng. Vui lòng đảm bảo dùng Mật khẩu ứng dụng (App Password 16 ký tự) của Gmail.";
    }
    throw new ApiError(400, `Lỗi gửi SMTP: ${errorMsg}`, "SMTP_ERROR");
  }
}

export async function sendTestEmail(userId: string, overrideParams?: SaveAutoForwardInput) {
  const config = await getOrCreateAutoForwardConfig(userId);
  const targetEmail = overrideParams?.targetEmail?.trim() || config.targetEmail;

  const options: EmailOptions = {
    to: targetEmail,
    subject: "[SmailBox] Kiểm tra kết nối gửi Email tự động",
    text: `Chào bạn,\n\nĐây là email kiểm tra kết nối từ hệ thống SmailBox Inbox Manager.\nTính năng gửi email tự động của bạn đã được cấu hình thành công.\nEmail nhận: ${targetEmail}\nThời gian: ${new Date().toLocaleString("vi-VN")}`,
    html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #4f46e5; border-radius: 8px;">
      <h2 style="color: #4f46e5;">SmailBox Auto Forward Test</h2>
      <p>Chào bạn,</p>
      <p>Đây là email kiểm tra kết nối từ hệ thống <strong>SmailBox Inbox Manager</strong>.</p>
      <p>Tính năng gửi email tự động của bạn đã được cấu hình thành công.</p>
      <ul>
        <li><strong>Email nhận:</strong> ${targetEmail}</li>
        <li><strong>Thời gian:</strong> ${new Date().toLocaleString("vi-VN")}</li>
      </ul>
    </div>`
  };

  await sendEmailMessage(userId, options, overrideParams);
  return { success: true, message: `Email kiểm tra đã được gửi thành công tới ${targetEmail}` };
}

export async function runAutoForwardBatchForUser(userId: string) {
  const config = await prisma.autoForwardConfig.findUnique({
    where: { userId }
  });

  if (!config || !config.enabled || !config.targetEmail) {
    return { count: 0, status: "disabled", detail: "Tính năng gửi email tự động đang bị tắt." };
  }

  let subjects: string[] = DEFAULT_OUTSYSTEMS_SUBJECTS;
  try {
    subjects = JSON.parse(config.subjectsJson);
  } catch {
    subjects = DEFAULT_OUTSYSTEMS_SUBJECTS;
  }

  // 1. Sync inbox for all user accounts
  const accounts = await listAccounts(userId);
  for (const account of accounts) {
    try {
      await syncInbox(userId, account.email);
    } catch (err) {
      console.error(`[AutoForward] Failed sync inbox for account ${account.email}:`, err);
    }
  }

  // 2. Query messages matching target subjects and isForwarded = false
  const unforwardedMessages = await prisma.inboxMessage.findMany({
    where: {
      userId,
      isForwarded: false
    }
  });

  const matchingMessages = unforwardedMessages.filter((msg) => {
    if (!msg.subject) return false;
    const msgSubLower = msg.subject.toLowerCase();
    return subjects.some((sub) => msgSubLower.includes(sub.toLowerCase()));
  });

  if (matchingMessages.length === 0) {
    return {
      count: 0,
      status: "no_matching_messages",
      detail: `Đã quét ${accounts.length} Gmail Account. Không có email mới nào khớp với các từ khóa tiêu đề.`
    };
  }

  // 3. Send emails
  let forwardedCount = 0;

  for (const msg of matchingMessages) {
    let fullMsg = msg;

    if (!fullMsg.body) {
      try {
        fullMsg = await syncMessage(userId, msg.email, msg.mid);
      } catch (err) {
        console.error(`[AutoForward] Failed to fetch body for msg ${msg.mid}:`, err);
      }
    }

    const emailOpts: EmailOptions = {
      to: config.targetEmail,
      subject: `[Fwd] ${fullMsg.subject || "(No Subject)"}`,
      text: `Original Sender: ${fullMsg.sender || "Unknown"}\nOriginal Recipient: ${fullMsg.email}\nReceived At: ${fullMsg.receivedAt ? new Date(fullMsg.receivedAt).toLocaleString("vi-VN") : "N/A"}\n\nSnippet:\n${fullMsg.snippet || ""}\n\n---\nBody:\n${fullMsg.body || fullMsg.snippet || "(No content)"}`,
      html: `
        <div style="font-family: Arial, sans-serif; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; max-width: 800px; margin: 0 auto;">
          <div style="background-color: #4f46e5; color: white; padding: 16px;">
            <h3 style="margin: 0;">Forwarded Mail from SmailBox</h3>
          </div>
          <div style="background-color: #f9fafb; padding: 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">
            <p style="margin: 4px 0;"><strong>From:</strong> ${fullMsg.sender || "Unknown"}</p>
            <p style="margin: 4px 0;"><strong>To:</strong> ${fullMsg.email}</p>
            <p style="margin: 4px 0;"><strong>Received:</strong> ${fullMsg.receivedAt ? new Date(fullMsg.receivedAt).toLocaleString("vi-VN") : "N/A"}</p>
            <p style="margin: 4px 0;"><strong>Subject:</strong> ${fullMsg.subject || "(No Subject)"}</p>
          </div>
          <div style="padding: 20px;">
            ${fullMsg.body || `<p style="color: #6b7280; font-style: italic;">${fullMsg.snippet || "No body content"}</p>`}
          </div>
        </div>
      `
    };

    try {
      await sendEmailMessage(userId, emailOpts);
      await prisma.inboxMessage.update({
        where: { id: fullMsg.id },
        data: {
          isForwarded: true,
          forwardedAt: new Date()
        }
      });
      forwardedCount++;

      await logFetch({
        userId,
        action: "auto_forward_email",
        endpoint: "/auto-forward/batch",
        requestParams: { targetEmail: config.targetEmail, mid: fullMsg.mid, subject: fullMsg.subject },
        status: "success"
      });
    } catch (err) {
      console.error(`[AutoForward] Error sending email for msg ${fullMsg.mid}:`, err);
      await logFetch({
        userId,
        action: "auto_forward_email",
        endpoint: "/auto-forward/batch",
        requestParams: { targetEmail: config.targetEmail, mid: fullMsg.mid },
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Send Error"
      });
    }
  }

  return {
    count: forwardedCount,
    status: "completed",
    detail: `Đã quét ${accounts.length} Gmail Account. Đã tìm thấy ${matchingMessages.length} email khớp tiêu đề và chuyển tiếp thành công ${forwardedCount} email tới ${config.targetEmail}.`
  };
}

export async function runAutoForwardBatchAllUsers() {
  const enabledConfigs = await prisma.autoForwardConfig.findMany({
    where: { enabled: true }
  });

  let totalForwarded = 0;
  for (const config of enabledConfigs) {
    try {
      const res = await runAutoForwardBatchForUser(config.userId);
      totalForwarded += res.count;
    } catch (err) {
      console.error(`[AutoForwardBatch] Error for user ${config.userId}:`, err);
    }
  }

  return { totalForwarded };
}
