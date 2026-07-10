import path from "node:path";
import { fileURLToPath } from "node:url";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { ApiError } from "./lib/api-error.js";
import { asyncHandler } from "./lib/async-handler.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./routes/auth.routes.js";
import { gmailRouter } from "./routes/gmail.routes.js";
import { profileRouter } from "./routes/profile.routes.js";

export const app = express();
if (config.trustProxy) app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: config.isProduction
    ? {
        directives: {
          "upgrade-insecure-requests": null,
          imgSrc: ["'self'", "data:", "blob:", "https:", "http:"]
        }
      }
    : false,
  crossOriginResourcePolicy: { policy: "same-origin" }
}));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "smailpro-inbox", time: new Date().toISOString() });
});
app.use("/auth", authRouter);
app.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, username: true, createdAt: true }
  });
  if (!user) throw new ApiError(401, "Tài khoản không còn tồn tại.", "USER_NOT_FOUND");
  res.json({ user });
}));
app.use("/profile", profileRouter);
app.use("/gmail", gmailRouter);

if (config.isProduction) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(currentDir, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*splat", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/") ||
        req.path.startsWith("/profile/") || req.path.startsWith("/gmail/") ||
        req.path === "/me") {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);
