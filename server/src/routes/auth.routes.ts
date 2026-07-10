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

authRouter.post("/register", authLimiter, asyncHandler(async (req, res) => {
  const input = credentials.extend({ username: z.string().trim().min(2).max(60).optional() }).parse(req.body);
  const exists = await prisma.user.findUnique({ where: { email: input.email } });
  if (exists) throw new ApiError(409, "Email này đã được đăng ký.", "EMAIL_EXISTS");
  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: await bcrypt.hash(input.password, 12)
    },
    select: { id: true, email: true, username: true, createdAt: true }
  });
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
