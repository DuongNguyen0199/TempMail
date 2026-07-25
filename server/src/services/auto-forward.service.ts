import dns from "node:dns";
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

  return {
    enabled: config.enabled,
    targetEmail: config.targetEmail,
    subjects,
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
  const smtpHost = input.smtpHost?.trim() ?? current.smtpHost;
  const smtpPort = input.smtpPort ?? current.smtpPort;
  const smtpSecure = input.smtpSecure ?? current.smtpSecure;
  const smtpUser = input.smtpUser?.trim() ?? current.smtpUser;

  let smtpPassEncrypted: string | undefined = undefined;
  if (input.smtpPass && input.smtpPass.trim()) {
    smtpPassEncrypted = encryptSecret(input.smtpPass.trim());
  }

  await prisma.autoForwardConfig.update({
    where: { userId },
    data: {
      enabled,
      targetEmail,
      subjectsJson: JSON.stringify(subjects),
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      ...(smtpPassEncrypted !== undefined ? { smtpPassEncrypted } : {})
    }
  });

  return getOrCreateAutoForwardConfig(userId);
}

export async function getTransporterForUser(userId: string, overrideParams?: SaveAutoForwardInput) {
  const config = await prisma.autoForwardConfig.findUnique({
    where: { userId }
  });

  const host = overrideParams?.smtpHost?.trim() || config?.smtpHost || "smtp.gmail.com";
  const port = overrideParams?.smtpPort || config?.smtpPort || 587;
  const secure = port === 465 ? true : (overrideParams?.smtpSecure ?? config?.smtpSecure ?? false);
  const user = overrideParams?.smtpUser?.trim() || config?.smtpUser || "";

  let pass: string | undefined = undefined;
  if (overrideParams?.smtpPass && overrideParams.smtpPass.trim()) {
    pass = overrideParams.smtpPass.trim();
  } else if (config?.smtpPassEncrypted) {
    pass = decryptSecret(config.smtpPassEncrypted);
  }

  if (!user || !pass) {
    throw new ApiError(
      400,
      "Vui lòng nhập đầy đủ SMTP User và Mật khẩu ứng dụng (App Password) để kết nối.",
      "SMTP_CREDENTIALS_REQUIRED"
    );
  }

  console.log(`[AutoForward] Creating SMTP transporter for ${user} via ${host}:${port} (secure: ${secure}, IPv4 forced)...`);

  return {
    config: {
      host,
      port,
      secure,
      user,
      targetEmail: overrideParams?.targetEmail?.trim() || config?.targetEmail || DEFAULT_TARGET_EMAIL
    },
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      lookup: customIpv4Lookup,
      family: 4, // Force IPv4 to avoid ENETUNREACH IPv6 errors on Render/cloud environments
      connectionTimeout: 10000, // 10s connection timeout
      greetingTimeout: 10000,
      socketTimeout: 15000
    } as any)
  };
}

export async function sendTestEmail(userId: string, overrideParams?: SaveAutoForwardInput) {
  const { config: smtpConfig, transporter } = await getTransporterForUser(userId, overrideParams);

  const mailOptions = {
    from: `SmailBox AutoForward <${smtpConfig.user}>`,
    to: smtpConfig.targetEmail,
    subject: "[SmailBox] Kiểm tra kết nối gửi Email tự động",
    text: `Chào bạn,\n\nĐây là email kiểm tra kết nối từ hệ thống SmailBox Inbox Manager.\nTính năng gửi email tự động của bạn đã được cấu hình thành công.\nEmail nhận: ${smtpConfig.targetEmail}\nThời gian: ${new Date().toLocaleString("vi-VN")}`,
    html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #4f46e5; border-radius: 8px;">
      <h2 style="color: #4f46e5;">SmailBox Auto Forward Test</h2>
      <p>Chào bạn,</p>
      <p>Đây là email kiểm tra kết nối từ hệ thống <strong>SmailBox Inbox Manager</strong>.</p>
      <p>Tính năng gửi email tự động của bạn đã được cấu hình thành công.</p>
      <ul>
        <li><strong>Email nhận:</strong> ${smtpConfig.targetEmail}</li>
        <li><strong>Thời gian:</strong> ${new Date().toLocaleString("vi-VN")}</li>
      </ul>
    </div>`
  };

  try {
    console.log(`[AutoForward] Sending test email to ${smtpConfig.targetEmail}...`);
    await transporter.sendMail(mailOptions);
    console.log(`[AutoForward] Test email sent successfully to ${smtpConfig.targetEmail}`);
    return { success: true, message: `Email kiểm tra đã được gửi thành công tới ${smtpConfig.targetEmail}` };
  } catch (error: any) {
    console.error("[AutoForward] SMTP Test Failed:", error);
    let errorMsg = error?.message || "Không thể kết nối đến máy chủ SMTP";
    if (errorMsg.includes("ETIMEDOUT") || errorMsg.includes("timeout")) {
      errorMsg = `Kết nối SMTP tới ${smtpConfig.host}:${smtpConfig.port} bị quá thời gian (Timeout). Hãy thử đổi Port 465 (Bật SSL/TLS).`;
    } else if (errorMsg.includes("535") || errorMsg.includes("Username and Password not accepted")) {
      errorMsg = "Mật khẩu SMTP không đúng. Vui lòng đảm bảo dùng Mật khẩu ứng dụng (App Password 16 ký tự) của Gmail.";
    }
    throw new ApiError(400, `Lỗi gửi SMTP: ${errorMsg}`, "SMTP_ERROR");
  }
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
  let syncedAccountsCount = 0;
  for (const account of accounts) {
    try {
      await syncInbox(userId, account.email);
      syncedAccountsCount++;
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
  const { config: smtpConfig, transporter } = await getTransporterForUser(userId);
  let forwardedCount = 0;

  for (const msg of matchingMessages) {
    let fullMsg = msg;

    // Fetch full body if missing
    if (!fullMsg.body) {
      try {
        fullMsg = await syncMessage(userId, msg.email, msg.mid);
      } catch (err) {
        console.error(`[AutoForward] Failed to fetch body for msg ${msg.mid}:`, err);
      }
    }

    const mailOptions = {
      from: `SmailBox AutoForward <${smtpConfig.user}>`,
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
      await transporter.sendMail(mailOptions);
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
        errorMessage: err instanceof Error ? err.message : "SMTP Send Error"
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
