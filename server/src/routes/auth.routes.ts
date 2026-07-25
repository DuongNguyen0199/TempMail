import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { asyncHandler } from "../lib/async-handler.js";
import { signAuthToken } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rate-limit.js";
import { sendEmailMessage } from "../services/auto-forward.service.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});

const cookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};

const ADMIN_EMAIL = "duongrbt@gmail.com";

async function sendAdminOtpEmail(userEmail: string, username: string | undefined, otpCode: string) {
  console.log(`[Admin OTP] --------------------------------------------------`);
  console.log(`[Admin OTP] 🔐 YÊU CẦU ĐĂNG KÝ TÀI KHOẢN MỚI: ${userEmail}`);
  console.log(`[Admin OTP] 🔑 MÃ OTP XÁC THỰC ADMIN: ${otpCode}`);
  console.log(`[Admin OTP] --------------------------------------------------`);

  try {
    const adminConfig = await prisma.autoForwardConfig.findFirst({
      where: { enabled: true }
    });

    if (adminConfig) {
      const emailOpts = {
        to: ADMIN_EMAIL,
        subject: `[SmailBox Admin] Mã OTP xác thực đăng ký tài khoản mới: ${userEmail}`,
        text: `Chào Admin (duongrbt@gmail.com),\n\nTài khoản ${userEmail} (${username || 'Chưa đặt tên'}) vừa gửi yêu cầu đăng ký SmailBox.\n\nMÃ OTP XÁC THỰC LÀ: ${otpCode}\n\nMã có hiệu lực trong 15 phút. Hãy cung cấp mã OTP này cho người đăng ký nếu bạn chấp nhận cho họ tạo tài khoản.\n\nThời gian: ${new Date().toLocaleString("vi-VN")}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #6366f1; border-radius: 8px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4f46e5; margin-top: 0;">SmailBox Admin OTP Notification</h2>
            <p>Chào Admin (<strong>duongrbt@gmail.com</strong>),</p>
            <p>Tài khoản <strong>${userEmail}</strong> ${username ? `(Tên: ${username})` : ''} vừa gửi yêu cầu đăng ký tài khoản mới trên hệ thống SmailBox.</p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; text-align: center; margin: 20px 0;">
              <span style="font-size: 13px; color: #64748b; font-weight: 600; display: block; margin-bottom: 6px;">MÃ OTP XÁC THỰC ĐĂNG KÝ:</span>
              <span style="font-size: 32px; font-weight: 800; color: #4f46e5; letter-spacing: 6px;">${otpCode}</span>
            </div>
            <p style="font-size: 13px; color: #475569;">
              ⏱️ Mã OTP này có hiệu lực trong <strong>15 phút</strong>. Vui lòng cung cấp mã này cho người dùng nếu bạn chấp nhận cho họ đăng ký.
            </p>
          </div>
        `
      };

      await sendEmailMessage(adminConfig.userId, emailOpts);
      console.log(`[Admin OTP] Successfully sent OTP email to Admin: ${ADMIN_EMAIL}`);
    }
  } catch (err) {
    console.error(`[Admin OTP] Could not send email notification to Admin, but OTP is logged in console:`, err);
  }
}

authRouter.post("/register", authLimiter, asyncHandler(async (req, res) => {
  const input = credentials.extend({ username: z.string().trim().min(2).max(60).optional() }).parse(req.body);
  
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new ApiError(409, "Email này đã được đăng ký.", "EMAIL_EXISTS");

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await prisma.pendingRegistration.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      username: input.username,
      passwordHash,
      otpCode,
      expiresAt
    },
    update: {
      username: input.username,
      passwordHash,
      otpCode,
      expiresAt
    }
  });

  await sendAdminOtpEmail(input.email, input.username, otpCode);

  res.status(200).json({
    requiresOtp: true,
    email: input.email,
    message: `Mã OTP xác thực đã được gửi tới Admin (${ADMIN_EMAIL}). Vui lòng liên hệ Admin (${ADMIN_EMAIL}) để lấy mã OTP và hoàn tất đăng ký.`
  });
}));

authRouter.post("/verify-otp", authLimiter, asyncHandler(async (req, res) => {
  const input = z.object({
    email: z.string().trim().email().transform((v) => v.toLowerCase()),
    otpCode: z.string().trim().min(6).max(6)
  }).parse(req.body);

  const pending = await prisma.pendingRegistration.findUnique({
    where: { email: input.email }
  });

  if (!pending) {
    throw new ApiError(400, "Không tìm thấy yêu cầu đăng ký cho email này. Vui lòng thực hiện đăng ký lại.", "PENDING_REGISTRATION_NOT_FOUND");
  }

  if (pending.expiresAt < new Date()) {
    await prisma.pendingRegistration.delete({ where: { email: input.email } });
    throw new ApiError(400, "Mã OTP đã hết hạn (15 phút). Vui lòng thực hiện đăng ký lại.", "OTP_EXPIRED");
  }

  if (pending.otpCode !== input.otpCode) {
    throw new ApiError(400, `Mã OTP không đúng. Vui lòng liên hệ Admin (${ADMIN_EMAIL}) để lấy mã OTP chính xác.`, "INVALID_OTP");
  }

  // Create official user
  const user = await prisma.user.create({
    data: {
      email: pending.email,
      username: pending.username,
      passwordHash: pending.passwordHash
    },
    select: { id: true, email: true, username: true, createdAt: true }
  });

  // Delete pending registration
  await prisma.pendingRegistration.delete({ where: { email: pending.email } });

  res.cookie("smailpro_token", signAuthToken({ sub: user.id, email: user.email }), cookieOptions);
  res.status(201).json({ user });
}));

authRouter.post("/login", authLimiter, asyncHandler(async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new ApiError(401, "Email hoặc mật khẩu không đúng.", "INVALID_CREDENTIALS");
  }
  res.cookie("smailpro_token", signAuthToken({ sub: user.id, email: user.email }), cookieOptions);
  res.json({ user: { id: user.id, email: user.email, username: user.username, createdAt: user.createdAt } });
}));

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("smailpro_token", { ...cookieOptions, maxAge: undefined });
  res.status(204).send();
});

authRouter.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, username: true, createdAt: true }
  });
  if (!user) throw new ApiError(401, "Tài khoản không còn tồn tại.", "USER_NOT_FOUND");
  res.json({ user });
}));
