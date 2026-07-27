import dns from "node:dns";
import axios from "axios";
import nodemailer from "nodemailer";
import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { getDecryptedApiKey } from "./api-config.service.js";
import { logFetch } from "./fetch-log.service.js";
import { listAccounts, syncInbox, syncMessage } from "./gmail.service.js";
import * as sonjj from "./sonjj.service.js";

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
  "OutSystems"
];

export const DEFAULT_TARGET_EMAIL = "duongrbt@gmail.com";

export interface SaveAutoForwardInput {
  enabled?: boolean;
  targetEmail?: string;
  subjects?: string[];
  mailProvider?: "sonjj" | "smtp" | "resend" | "brevo";
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
        mailProvider: "sonjj",
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
    mailProvider: (config.mailProvider as any) || "sonjj",
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

  const provider = overrideParams?.mailProvider || dbConfig?.mailProvider || "sonjj";
  const targetEmail = overrideParams?.targetEmail?.trim() || dbConfig?.targetEmail || DEFAULT_TARGET_EMAIL;

  let apiSecret: string | undefined = undefined;
  if (overrideParams?.apiSecret && overrideParams.apiSecret.trim()) {
    apiSecret = overrideParams.apiSecret.trim();
  } else if (dbConfig?.apiSecretEncrypted) {
    apiSecret = decryptSecret(dbConfig.apiSecretEncrypted);
  }

  const fromEmail = overrideParams?.fromEmail?.trim() || dbConfig?.fromEmail || overrideParams?.smtpUser?.trim() || dbConfig?.smtpUser || "onboarding@resend.dev";

  // Provider 1: Sonjj SMTP Relay API (HTTPS Port 443 REST API - Recommended & Unblocked)
  if (provider === "sonjj" || provider === "smtp") {
    let sonjjApiKey = "";
    try {
      sonjjApiKey = await getDecryptedApiKey(userId);
    } catch {
      if (provider === "sonjj") throw new ApiError(400, "Vui lòng lưu API Key Sonjj/SmailPro trong phần Cài đặt trước.", "SONJJ_KEY_REQUIRED");
    }

    const host = overrideParams?.smtpHost?.trim() || dbConfig?.smtpHost || "smtp.gmail.com";
    const port = overrideParams?.smtpPort || dbConfig?.smtpPort || 587;
    const user = overrideParams?.smtpUser?.trim() || dbConfig?.smtpUser || "";

    let pass: string | undefined = undefined;
    if (overrideParams?.smtpPass && overrideParams.smtpPass.trim()) {
      pass = overrideParams.smtpPass.trim();
    } else if (dbConfig?.smtpPassEncrypted) {
      pass = decryptSecret(dbConfig.smtpPassEncrypted);
    }

    if (sonjjApiKey && user && pass) {
      console.log(`[AutoForward] Sending email via Sonjj SMTP Relay (HTTPS Port 443) to ${targetEmail}...`);
      try {
        const res = await sonjj.sendSmtpEmail(sonjjApiKey, {
          smtp_host: host,
          smtp_port: port,
          smtp_user: user,
          smtp_pass: pass,
          use_tls: port === 587,
          from_email: user,
          from_name: "SmailBox AutoForward",
          to: [targetEmail],
          subject: options.subject,
          body_text: options.text,
          body_html: options.html
        });

        if (!res.success) {
          throw new Error(res.error_message || res.error_code || "Sonjj SMTP Relay trả về lỗi.");
        }

        console.log(`[AutoForward] Sent successfully via Sonjj SMTP Relay API. MsgID: ${res.message_id || 'N/A'}`);
        return { success: true, provider: "sonjj", messageId: res.message_id };
      } catch (err: any) {
        console.error("[AutoForward] Sonjj SMTP Relay Error:", err?.message || err);
        if (provider === "sonjj") {
          throw new ApiError(400, `Lỗi Sonjj SMTP Relay: ${err?.message || "Không thể gửi email qua Sonjj"}`, "SONJJ_RELAY_ERROR");
        }
      }
    }
  }

  // Provider 2: Resend HTTP API (Port 443 HTTPS - Never blocked)
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

  // Provider 3: Brevo HTTP API (Port 443 HTTPS - Never blocked)
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

  // Provider 4: Traditional Direct Nodemailer SMTP
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
      "Vui lòng nhập đầy đủ Email gửi (SMTP User) và Mật khẩu ứng dụng (App Password) để kết nối.",
      "SMTP_CREDENTIALS_REQUIRED"
    );
  }

  console.log(`[AutoForward] Creating direct SMTP transporter for ${user} via ${host}:${port}...`);

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
    console.log(`[AutoForward] Sent successfully via Direct SMTP.`);
    return { success: true, provider: "smtp" };
  } catch (error: any) {
    console.error("[AutoForward] SMTP Test Failed:", error);
    let errorMsg = error?.message || "Không thể kết nối đến máy chủ SMTP";
    if (errorMsg.includes("ENETUNREACH") || errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
      errorMsg = `Cổng SMTP ${port} bị môi trường máy chủ chặn. Hãy chuyển sang dùng Sonjj SMTP Relay (Cổng HTTPS 443 không bị chặn).`;
    } else if (errorMsg.includes("535") || errorMsg.includes("Username and Password not accepted")) {
      errorMsg = "Mật khẩu SMTP không đúng. Vui lòng đảm bảo dùng Mật khẩu ứng dụng (App Password 16 ký tự) của Gmail.";
    }
    throw new ApiError(400, `Lỗi gửi SMTP: ${errorMsg}`, "SMTP_ERROR");
  }
}

export interface CustomSendEmailInput {
  fromEmail?: string;
  smtpPass?: string;
  smtpHost?: string;
  smtpPort?: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  saveToSettings?: boolean;
}

export async function sendCustomEmail(userId: string, input: CustomSendEmailInput) {
  const sonjjApiKey = await getDecryptedApiKey(userId);
  const dbConfig = await prisma.autoForwardConfig.findUnique({
    where: { userId }
  });

  // Header From Email hiển thị trên thư (Ví dụ: louellagonzale.z1201.5@gmail.com)
  const headerFromEmail = input.fromEmail?.trim() || dbConfig?.smtpUser || "onboarding@resend.dev";

  // Tài khoản SMTP Master dùng để xác thực kết nối (Cấu hình trong Cài Đặt)
  const smtpUser = dbConfig?.smtpUser || headerFromEmail;
  let smtpPass: string | undefined = input.smtpPass?.trim();

  // Kiểm tra nếu tài khoản có mật khẩu riêng được lưu trong CSDL
  if (!smtpPass && headerFromEmail) {
    const account = await prisma.gmailAccount.findFirst({
      where: { userId, email: headerFromEmail.toLowerCase() }
    });
    if (account && account.password) {
      smtpPass = account.password;
    }
  }

  // Lấy mật khẩu Master SMTP từ Cài Đặt nếu không có mật khẩu riêng
  if (!smtpPass && dbConfig?.smtpPassEncrypted) {
    smtpPass = decryptSecret(dbConfig.smtpPassEncrypted);
  }

  const host = input.smtpHost?.trim() || dbConfig?.smtpHost || "smtp.gmail.com";
  const port = input.smtpPort || dbConfig?.smtpPort || 587;
  const provider = dbConfig?.mailProvider || "sonjj";

  // Dịch vụ 1: Resend HTTP API
  if (provider === "resend") {
    let apiSecret = dbConfig?.apiSecretEncrypted ? decryptSecret(dbConfig.apiSecretEncrypted) : undefined;
    if (!apiSecret) {
      throw new ApiError(400, "Vui lòng nhập API Key Resend trong phần Cài đặt trước.", "RESEND_KEY_REQUIRED");
    }
    console.log(`[SendCustomEmail] Sending via Resend with From Header: ${headerFromEmail}...`);
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: headerFromEmail.includes("<") ? headerFromEmail : `${headerFromEmail.split("@")[0]} <${headerFromEmail}>`,
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          text: input.bodyText,
          html: input.bodyHtml || input.bodyText
        },
        {
          headers: { Authorization: `Bearer ${apiSecret}`, "Content-Type": "application/json" },
          timeout: 15000
        }
      );
      return { success: true, detail: `Đã gửi email thành công với tiêu đề người gửi là ${headerFromEmail}!` };
    } catch (err: any) {
      console.error("[SendCustomEmail] Resend Error:", err?.response?.data || err?.message);
      const resendErr = err?.response?.data?.message || err?.message || "Lỗi Resend API";
      throw new ApiError(400, `Lỗi Resend API: ${resendErr}`, "RESEND_ERROR");
    }
  }

  // Dịch vụ 2: Sonjj SMTP Relay API
  if (!smtpPass) {
    throw new ApiError(
      400,
      `Vui lòng nhập Mật khẩu ứng dụng (App Password) trong mục Cài Đặt. Hệ thống sẽ tự động dùng thông tin này làm Master SMTP Relay để gửi thư dưới tên ${headerFromEmail}.`,
      "SMTP_CREDENTIALS_REQUIRED"
    );
  }

  console.log(`[SendCustomEmail] Sending via Sonjj SMTP Relay. Auth user: ${smtpUser}, From Header: ${headerFromEmail}...`);

  const res = await sonjj.sendSmtpEmail(sonjjApiKey, {
    smtp_host: host,
    smtp_port: port,
    smtp_user: smtpUser,
    smtp_pass: smtpPass,
    use_tls: port === 587,
    from_email: headerFromEmail,
    from_name: headerFromEmail.split("@")[0],
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
    subject: input.subject,
    body_text: input.bodyText,
    body_html: input.bodyHtml || input.bodyText
  });

  if (!res.success) {
    throw new ApiError(400, `Lỗi Sonjj SMTP Relay: ${res.error_message || res.error_code || 'Gửi thất bại'}`, "SEND_FAILED");
  }

  await logFetch({
    userId,
    action: "send_smtp_email",
    endpoint: "/v1/send_smtp_email/",
    requestParams: { from: headerFromEmail, to: input.to, subject: input.subject },
    status: "success"
  });

  return {
    success: true,
    messageId: res.message_id,
    detail: `Đã gửi email thành công từ ${headerFromEmail} tới ${input.to.join(", ")}!`
  };
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

  // 2. Query ALL messages matching target subjects (OutSystems)
  const allMessages = await prisma.inboxMessage.findMany({
    where: { userId }
  });

  const matchingMessages = allMessages.filter((msg) => {
    if (!msg.subject) return false;
    const msgSubLower = msg.subject.toLowerCase();
    return subjects.some((sub) => msgSubLower.includes(sub.toLowerCase()));
  });

  // Save/Upsert into OsMail table for every matching message
  for (const msg of matchingMessages) {
    let fullMsg = msg;
    if (!fullMsg.body) {
      try {
        fullMsg = await syncMessage(userId, msg.email, msg.mid);
      } catch (err) {
        console.error(`[AutoForward] Failed to fetch body for msg ${msg.mid}:`, err);
      }
    }

    try {
      await prisma.osMail.upsert({
        where: { userId_email_mid: { userId, email: fullMsg.email, mid: fullMsg.mid } },
        create: {
          userId,
          gmailAccountId: fullMsg.gmailAccountId,
          email: fullMsg.email,
          mid: fullMsg.mid,
          sender: fullMsg.sender,
          subject: fullMsg.subject,
          snippet: fullMsg.snippet,
          body: fullMsg.body || fullMsg.snippet,
          receivedAt: fullMsg.receivedAt,
          status: fullMsg.isForwarded ? "FORWARDED" : "PENDING",
          forwardedAt: fullMsg.forwardedAt
        },
        update: {
          sender: fullMsg.sender,
          subject: fullMsg.subject,
          snippet: fullMsg.snippet,
          body: fullMsg.body || fullMsg.snippet,
          receivedAt: fullMsg.receivedAt
        }
      });
    } catch (err) {
      console.error(`[OsMail] Upsert error for msg ${fullMsg.mid}:`, err);
    }
  }

  // 3. Select OsMail items needing forward (status PENDING or FAILED)
  const pendingOsMails = await prisma.osMail.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "FAILED"] }
    }
  });

  if (pendingOsMails.length === 0) {
    return {
      count: 0,
      status: "no_pending_messages",
      detail: `Đã quét ${accounts.length} Gmail Account. Đã lưu ${matchingMessages.length} OutSystems Mail vào CSDL (Không có email mới cần gửi).`
    };
  }

  // 4. Send emails and update status for each OsMail item
  let forwardedCount = 0;

  for (const osItem of pendingOsMails) {
    const emailOpts: EmailOptions = {
      to: config.targetEmail,
      subject: `[Fwd] ${osItem.subject || "(No Subject)"}`,
      text: `Original Sender: ${osItem.sender || "Unknown"}\nOriginal Recipient: ${osItem.email}\nReceived At: ${osItem.receivedAt ? new Date(osItem.receivedAt).toLocaleString("vi-VN") : "N/A"}\n\nSnippet:\n${osItem.snippet || ""}\n\n---\nBody:\n${osItem.body || osItem.snippet || "(No content)"}`,
      html: `
        <div style="font-family: Arial, sans-serif; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; max-width: 800px; margin: 0 auto;">
          <div style="background-color: #4f46e5; color: white; padding: 16px;">
            <h3 style="margin: 0;">OutSystems Mail - Forwarded from SmailBox</h3>
          </div>
          <div style="background-color: #f9fafb; padding: 16px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">
            <p style="margin: 4px 0;"><strong>From:</strong> ${osItem.sender || "Unknown"}</p>
            <p style="margin: 4px 0;"><strong>To:</strong> ${osItem.email}</p>
            <p style="margin: 4px 0;"><strong>Received:</strong> ${osItem.receivedAt ? new Date(osItem.receivedAt).toLocaleString("vi-VN") : "N/A"}</p>
            <p style="margin: 4px 0;"><strong>Subject:</strong> ${osItem.subject || "(No Subject)"}</p>
          </div>
          <div style="padding: 20px;">
            ${osItem.body || `<p style="color: #6b7280; font-style: italic;">${osItem.snippet || "No body content"}</p>`}
          </div>
        </div>
      `
    };

    try {
      await sendEmailMessage(userId, emailOpts);
      const now = new Date();

      // Update OsMail status to FORWARDED
      await prisma.osMail.update({
        where: { id: osItem.id },
        data: {
          status: "FORWARDED",
          forwardedAt: now,
          errorMessage: null
        }
      });

      // Update InboxMessage isForwarded
      await prisma.inboxMessage.updateMany({
        where: { userId, email: osItem.email, mid: osItem.mid },
        data: {
          isForwarded: true,
          forwardedAt: now
        }
      });

      forwardedCount++;

      await logFetch({
        userId,
        action: "auto_forward_email",
        endpoint: "/auto-forward/batch",
        requestParams: { targetEmail: config.targetEmail, mid: osItem.mid, subject: osItem.subject },
        status: "success"
      });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : "Send Error";
      console.error(`[AutoForward] Error sending email for OsMail ${osItem.mid}:`, err);

      await prisma.osMail.update({
        where: { id: osItem.id },
        data: {
          status: "FAILED",
          errorMessage: errorMsg
        }
      });

      await logFetch({
        userId,
        action: "auto_forward_email",
        endpoint: "/auto-forward/batch",
        requestParams: { targetEmail: config.targetEmail, mid: osItem.mid },
        status: "error",
        errorMessage: errorMsg
      });
    }
  }

  return {
    count: forwardedCount,
    status: "completed",
    detail: `Đã quét ${accounts.length} Gmail Account. Đã tìm thấy ${matchingMessages.length} OutSystems Mail và chuyển tiếp thành công ${forwardedCount} email tới ${config.targetEmail}.`
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

export async function syncAllOsMailsAllUsers() {
  const allAccounts = await prisma.gmailAccount.findMany({
    select: { userId: true, email: true }
  });

  let totalSynced = 0;

  for (const account of allAccounts) {
    try {
      await syncInbox(account.userId, account.email);
      totalSynced++;
    } catch (err) {
      console.error(`[SyncAllOsMails] Error syncing ${account.email}:`, err);
    }
  }

  // Scan all messages matching "outsystems" across system
  const allMessages = await prisma.inboxMessage.findMany();
  const matchingMessages = allMessages.filter((msg) => {
    if (!msg.subject) return false;
    return msg.subject.toLowerCase().includes("outsystems");
  });

  let osMailUpsertCount = 0;

  for (const msg of matchingMessages) {
    let fullMsg = msg;
    if (!fullMsg.body) {
      try {
        fullMsg = await syncMessage(msg.userId, msg.email, msg.mid);
      } catch (err) {
        console.error(`[SyncAllOsMails] Error fetching body for msg ${msg.mid}:`, err);
      }
    }

    try {
      await prisma.osMail.upsert({
        where: { userId_email_mid: { userId: fullMsg.userId, email: fullMsg.email, mid: fullMsg.mid } },
        create: {
          userId: fullMsg.userId,
          gmailAccountId: fullMsg.gmailAccountId,
          email: fullMsg.email,
          mid: fullMsg.mid,
          sender: fullMsg.sender,
          subject: fullMsg.subject,
          snippet: fullMsg.snippet,
          body: fullMsg.body || fullMsg.snippet,
          receivedAt: fullMsg.receivedAt,
          status: fullMsg.isForwarded ? "FORWARDED" : "PENDING",
          forwardedAt: fullMsg.forwardedAt
        },
        update: {
          sender: fullMsg.sender,
          subject: fullMsg.subject,
          snippet: fullMsg.snippet,
          body: fullMsg.body || fullMsg.snippet,
          receivedAt: fullMsg.receivedAt
        }
      });
      osMailUpsertCount++;
    } catch (err) {
      console.error(`[SyncAllOsMails] Upsert error for msg ${fullMsg.mid}:`, err);
    }
  }

  return {
    success: true,
    totalAccounts: allAccounts.length,
    totalOsMails: osMailUpsertCount,
    detail: `Đã đồng bộ thành công ${totalSynced}/${allAccounts.length} hòm thư Gmail và cập nhật ${osMailUpsertCount} OutSystems Mail dùng chung cho toàn hệ thống!`
  };
}

export async function listOsMails(
  _userId: string,
  filters: { email?: string; status?: string; search?: string; page?: number; limit?: number }
) {
  const where: any = {};
  if (filters.email) {
    where.email = filters.email.toLowerCase();
  }
  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }
  if (filters.search) {
    where.OR = [
      { sender: { contains: filters.search } },
      { subject: { contains: filters.search } },
      { snippet: { contains: filters.search } },
      { email: { contains: filters.search } }
    ];
  }

  const page = filters.page || 1;
  const limit = filters.limit || 25;

  const [data, total, statsForwarded, statsPending, statsFailed, allStatsTotal] = await Promise.all([
    prisma.osMail.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.osMail.count({ where }),
    prisma.osMail.count({ where: { status: "FORWARDED" } }),
    prisma.osMail.count({ where: { status: "PENDING" } }),
    prisma.osMail.count({ where: { status: "FAILED" } }),
    prisma.osMail.count()
  ]);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    },
    stats: {
      total: allStatsTotal,
      forwarded: statsForwarded,
      pending: statsPending,
      failed: statsFailed
    }
  };
}

export async function getOsMailById(_userId: string, id: string) {
  const osMail = await prisma.osMail.findUnique({
    where: { id }
  });
  if (!osMail) {
    throw new ApiError(404, "Không tìm thấy OutSystems Mail này.", "OS_MAIL_NOT_FOUND");
  }
  return osMail;
}
