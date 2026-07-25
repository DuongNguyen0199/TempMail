import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchLimiter } from "../middleware/rate-limit.js";
import {
  getOrCreateAutoForwardConfig,
  runAutoForwardBatchForUser,
  saveAutoForwardConfig,
  sendTestEmail
} from "../services/auto-forward.service.js";

export const autoForwardRouter = Router();
autoForwardRouter.use(requireAuth);

const autoForwardSchema = z.object({
  enabled: z.boolean().optional(),
  targetEmail: z.string().email("Email nhận không hợp lệ.").optional(),
  subjects: z.array(z.string()).optional(),
  smtpHost: z.string().trim().optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().optional(),
  smtpPass: z.string().optional()
});

autoForwardRouter.get("/auto-forward", asyncHandler(async (req, res) => {
  const config = await getOrCreateAutoForwardConfig(req.user!.id);
  res.json(config);
}));

autoForwardRouter.put("/auto-forward", asyncHandler(async (req, res) => {
  const input = autoForwardSchema.parse(req.body);
  const updated = await saveAutoForwardConfig(req.user!.id, input);
  res.json(updated);
}));

autoForwardRouter.post("/auto-forward/test-smtp", fetchLimiter, asyncHandler(async (req, res) => {
  const input = autoForwardSchema.partial().parse(req.body || {});
  const result = await sendTestEmail(req.user!.id, input);
  res.json(result);
}));

autoForwardRouter.post("/auto-forward/run-now", fetchLimiter, asyncHandler(async (req, res) => {
  const result = await runAutoForwardBatchForUser(req.user!.id);
  res.json(result);
}));
