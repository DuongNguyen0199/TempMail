-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "user_api_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sonjj_smailpro',
    "apiKeyEncrypted" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_api_configs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "gmail_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT,
    "password" TEXT,
    "timestamp" BIGINT,
    "rawJson" JSONB,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "gmail_accounts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gmailAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "sender" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "receivedAt" DATETIME,
    "receivedTs" BIGINT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT,
    "rawInboxJson" JSONB,
    "rawMessageJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inbox_messages_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inbox_messages_gmailAccountId_fkey"
      FOREIGN KEY ("gmailAccountId") REFERENCES "gmail_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "fetch_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestParams" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fetch_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "user_api_configs_userId_idx" ON "user_api_configs"("userId");
CREATE UNIQUE INDEX "user_api_configs_userId_provider_key" ON "user_api_configs"("userId", "provider");
CREATE INDEX "gmail_accounts_userId_updatedAt_idx" ON "gmail_accounts"("userId", "updatedAt");
CREATE UNIQUE INDEX "gmail_accounts_userId_email_key" ON "gmail_accounts"("userId", "email");
CREATE INDEX "inbox_messages_userId_email_receivedAt_idx" ON "inbox_messages"("userId", "email", "receivedAt");
CREATE INDEX "inbox_messages_gmailAccountId_receivedAt_idx" ON "inbox_messages"("gmailAccountId", "receivedAt");
CREATE UNIQUE INDEX "inbox_messages_userId_email_mid_key" ON "inbox_messages"("userId", "email", "mid");
CREATE INDEX "fetch_logs_userId_createdAt_idx" ON "fetch_logs"("userId", "createdAt");
