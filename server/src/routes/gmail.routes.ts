import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/async-handler.js";
import { serializeBigInts } from "../lib/json.js";
import { requireAuth } from "../middleware/auth.js";
import { fetchLimiter } from "../middleware/rate-limit.js";
import {
  addBulkAccounts,
  addManualAccount,
  deleteManualAccount,
  getMessage,
  listAccounts,
  searchAllInboxes,
  searchAllInboxesFromApi,
  searchInbox,
  syncInbox,
  syncMessage
} from "../services/gmail.service.js";

export const gmailRouter = Router();
gmailRouter.use(requireAuth);

const emailParam = z.string().email().max(254).transform((value) => value.toLowerCase());
const midParam = z.string().trim().min(1).max(512);
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
};

gmailRouter.get("/accounts", asyncHandler(async (req, res) => {
  res.json({ data: serializeBigInts(await listAccounts(req.user!.id)) });
}));

gmailRouter.get("/search-all", fetchLimiter, asyncHandler(async (req, res) => {
  const filters = z.object({
    sender: z.string().trim().max(200).optional(),
    subject: z.string().trim().max(300).optional(),
    ...pagination
  }).parse(req.query);
  res.json(serializeBigInts(await searchAllInboxesFromApi(req.user!.id, filters)));
}));

gmailRouter.post("/accounts", asyncHandler(async (req, res) => {
  const input = z.object({
    email: z.string().email().max(254).transform((value) => value.toLowerCase())
  }).parse(req.body);
  res.status(201).json({ account: serializeBigInts(await addManualAccount(req.user!.id, input)) });
}));

gmailRouter.post("/accounts/bulk", asyncHandler(async (req, res) => {
  const input = z.object({
    emails: z.array(z.string()).optional(),
    emailsText: z.string().optional()
  }).parse(req.body);

  let rawList: string[] = input.emails || [];
  if (input.emailsText) {
    rawList = [...rawList, ...input.emailsText.split(/\r?\n/)];
  }

  const result = await addBulkAccounts(req.user!.id, { emails: rawList });
  res.status(201).json(result);
}));

gmailRouter.delete("/accounts/:email", asyncHandler(async (req, res) => {
  const email = emailParam.parse(req.params.email);
  res.json(await deleteManualAccount(req.user!.id, email));
}));

const inboxHandler = asyncHandler(async (req, res) => {
  const email = emailParam.parse(req.params.email);
  const filters = z.object({
    sender: z.string().trim().max(200).optional(),
    subject: z.string().trim().max(300).optional(),
    ...pagination
  }).parse(req.query);
  res.json(serializeBigInts(await searchInbox(req.user!.id, email, filters)));
});

gmailRouter.get("/:email/inbox", inboxHandler);
gmailRouter.get("/:email/inbox/search", inboxHandler);

gmailRouter.post("/:email/inbox/fetch", fetchLimiter, asyncHandler(async (req, res) => {
  const email = emailParam.parse(req.params.email);
  const { timestamp } = z.object({
    timestamp: z.coerce.number().int().nonnegative().optional()
  }).parse(req.body);
  res.json(await syncInbox(req.user!.id, email, timestamp));
}));

gmailRouter.get("/:email/messages/:mid", asyncHandler(async (req, res) => {
  const email = emailParam.parse(req.params.email);
  const mid = midParam.parse(req.params.mid);
  res.json({ message: serializeBigInts(await getMessage(req.user!.id, email, mid)) });
}));

gmailRouter.post("/:email/messages/:mid/fetch", fetchLimiter, asyncHandler(async (req, res) => {
  const email = emailParam.parse(req.params.email);
  const mid = midParam.parse(req.params.mid);
  res.json({ message: serializeBigInts(await syncMessage(req.user!.id, email, mid)) });
}));
