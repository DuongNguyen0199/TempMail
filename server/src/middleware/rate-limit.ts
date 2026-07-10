import { ipKeyGenerator, rateLimit } from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Quá nhiều yêu cầu, vui lòng thử lại sau." } }
});

export const fetchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "127.0.0.1"),
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "FETCH_RATE_LIMITED",
      message: "Bạn đang đồng bộ quá nhanh. Vui lòng chờ một phút để tránh hao credit."
    }
  }
});
