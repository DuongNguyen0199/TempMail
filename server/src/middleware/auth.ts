import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/api-error.js";
import { verifyAuthToken } from "../lib/jwt.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = req.cookies?.smailpro_token ?? bearer;
  if (!token) {
    next(new ApiError(401, "Bạn cần đăng nhập để tiếp tục.", "AUTH_REQUIRED"));
    return;
  }
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    next(new ApiError(401, "Phiên đăng nhập đã hết hạn.", "INVALID_SESSION"));
  }
}
