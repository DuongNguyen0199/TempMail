import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchLimiter } from "../middleware/rate-limit.js";
import {
  deleteApiKey,
  getApiConfig,
  getInboxTimestamp,
  saveApiKey,
  saveInboxTimestamp
} from "../services/api-config.service.js";
import { validateKey } from "../services/sonjj.service.js";

export const profileRouter = Router();
profileRouter.use(requireAuth);

const apiKeySchema = z.object({ apiKey: z.string().trim().min(8).max(512) });
const inboxTimestampSchema = z.object({
  inboxTimestamp: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
});

profileRouter.get("/api-config", asyncHandler(async (req, res) => {
  res.json(await getApiConfig(req.user!.id));
}));

profileRouter.post("/api-config/test", fetchLimiter, asyncHandler(async (req, res) => {
  const { apiKey } = apiKeySchema.parse(req.body);
  await validateKey(apiKey);
  res.json({ valid: true, message: "API key hoạt động." });
}));

profileRouter.post("/api-config", asyncHandler(async (req, res) => {
  const { apiKey } = apiKeySchema.parse(req.body);
  res.json(await saveApiKey(req.user!.id, apiKey));
}));

profileRouter.delete("/api-config", asyncHandler(async (req, res) => {
  await deleteApiKey(req.user!.id);
  res.status(204).send();
}));

profileRouter.get("/inbox-config", asyncHandler(async (req, res) => {
  res.json(await getInboxTimestamp(req.user!.id));
}));

profileRouter.put("/inbox-config", asyncHandler(async (req, res) => {
  const { inboxTimestamp } = inboxTimestampSchema.parse(req.body);
  res.json(await saveInboxTimestamp(req.user!.id, inboxTimestamp));
}));
