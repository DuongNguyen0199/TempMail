import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { serializeBigInts } from "../lib/json.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchLimiter } from "../middleware/rate-limit.js";
import {
  getOrCreateAutoForwardConfig,
  getOsMailById,
  listOsMails,
  runAutoForwardBatchForUser,
  saveAutoForwardConfig,
  sendCustomEmail,
  sendTestEmail,
  syncAllOsMailsAllUsers
} from "../services/auto-forward.service.js";
import { getSchedulerStatus } from "../services/scheduler.js";

export const autoForwardRouter = Router();
autoForwardRouter.use(requireAuth);

const autoForwardSchema = z.object({
  enabled: z.boolean().optional(),
  targetEmail: z.string().email("Email nhận không hợp lệ.").optional(),
  subjects: z.array(z.string()).optional(),
  mailProvider: z.enum(["sonjj", "smtp", "resend", "brevo"]).optional(),
  fromEmail: z.string().trim().optional(),
  apiSecret: z.string().trim().optional(),
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

autoForwardRouter.get("/auto-forward/scheduler-status", asyncHandler(async (_req, res) => {
  const status = getSchedulerStatus();
  res.json(status);
}));

autoForwardRouter.post("/auto-forward/test-smtp", fetchLimiter, asyncHandler(async (req, res) => {
  const input = autoForwardSchema.partial().parse(req.body || {});
  const result = await sendTestEmail(req.user!.id, input);
  res.json(result);
}));

autoForwardRouter.post("/send-email", fetchLimiter, asyncHandler(async (req, res) => {
  const schema = z.object({
    fromEmail: z.string().optional(),
    to: z.array(z.string().email("Email người nhận không hợp lệ.")).min(1, "Vui lòng nhập ít nhất 1 email nhận."),
    cc: z.array(z.string().email()).optional(),
    bcc: z.array(z.string().email()).optional(),
    subject: z.string().trim().min(1, "Vui lòng nhập tiêu đề email."),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional()
  });

  const input = schema.parse(req.body);
  const result = await sendCustomEmail(req.user!.id, input);
  res.json(result);
}));

autoForwardRouter.post("/auto-forward/run-now", fetchLimiter, asyncHandler(async (req, res) => {
  const result = await runAutoForwardBatchForUser(req.user!.id);
  res.json(result);
}));

autoForwardRouter.post("/os-mails/sync", fetchLimiter, asyncHandler(async (req, res) => {
  const result = await syncAllOsMailsAllUsers();
  res.json(result);
}));

autoForwardRouter.get("/os-mails", asyncHandler(async (req, res) => {
  const query = z.object({
    email: z.string().optional(),
    status: z.string().optional(),
    search: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25)
  }).parse(req.query);

  const result = await listOsMails(req.user!.id, query);
  res.json(serializeBigInts(result));
}));

autoForwardRouter.get("/os-mails/:id", asyncHandler(async (req, res) => {
  const result = await getOsMailById(req.user!.id, String(req.params.id));
  res.json(serializeBigInts(result));
}));
