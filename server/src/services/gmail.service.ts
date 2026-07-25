import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { toJsonValue } from "../lib/json.js";
import { getOrCreateAutoForwardConfig, runAutoForwardBatchForUser } from "./auto-forward.service.js";
import { getDecryptedApiKey } from "./api-config.service.js";
import { logFetch } from "./fetch-log.service.js";
import * as sonjj from "./sonjj.service.js";

const text = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
};

const first = (source: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const integer = (value: unknown): number | undefined => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? Math.trunc(number) : undefined;
};

const toDate = (value: unknown): Date | undefined => {
  if (typeof value === "string" && value && !/^\d+$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? undefined : date;
  }
  const number = integer(value);
  if (number === undefined) return undefined;
  const date = new Date(number < 10_000_000_000 ? number * 1000 : number);
  return Number.isNaN(date.valueOf()) ? undefined : date;
};

export function normalizeMessage(item: Record<string, unknown>) {
  const mid = text(first(item, ["mid", "id", "message_id", "messageId"]));
  if (!mid) return null;
  const receivedValue = first(item, [
    "timestamp",
    "received_at",
    "receivedAt",
    "date",
    "textDate",
    "time",
    "created_at"
  ]);
  const receivedTs = integer(receivedValue);
  const senderRaw = first(item, [
    "sender",
    "from",
    "from_email",
    "fromEmail",
    "from_name",
    "fromName",
    "mail_from",
    "mailFrom",
    "textFrom",
    "name"
  ]);
  const sender = typeof senderRaw === "object" && senderRaw
    ? text(first(senderRaw as Record<string, unknown>, ["email", "address", "name", "text", "value"]))
    : text(senderRaw);
  return {
    mid,
    sender,
    subject: text(first(item, ["subject", "title", "textSubject", "mail_subject", "mailSubject"])),
    snippet: text(first(item, ["snippet", "preview", "text", "message", "textSnippet", "textContent"])),
    receivedAt: toDate(receivedValue),
    receivedTs,
    isRead: Boolean(first(item, ["is_read", "isRead", "read"]))
  };
}

async function ownedAccount(userId: string, email: string) {
  const account = await prisma.gmailAccount.findFirst({
    where: { userId, email: email.toLowerCase() }
  });
  if (!account) {
    throw new ApiError(404, "Không tìm thấy Gmail này trong tài khoản của bạn.", "ACCOUNT_NOT_FOUND");
  }
  return account;
}

export async function listAccounts(userId: string) {
  return prisma.gmailAccount.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { email: "asc" }],
    include: { _count: { select: { messages: true } } }
  });
}

export async function addManualAccount(userId: string, input: { email: string }) {
  // 1. Kiểm tra cấu hình Auto Forward trước khi cho phép thêm Gmail
  const forwardConfig = await getOrCreateAutoForwardConfig(userId);

  if (!forwardConfig.enabled) {
    throw new ApiError(
      400,
      "Vui lòng BẬT tính năng tự động gửi email trong mục Cài đặt trước khi thêm Gmail mới.",
      "FORWARD_CONFIG_DISABLED"
    );
  }

  if (!forwardConfig.targetEmail || !forwardConfig.targetEmail.trim()) {
    throw new ApiError(
      400,
      "Vui lòng thiết lập Email nhận chuyển tiếp (Target Email) trong mục Cài đặt trước khi thêm Gmail mới.",
      "TARGET_EMAIL_REQUIRED"
    );
  }

  if (!forwardConfig.subjects || forwardConfig.subjects.length === 0) {
    throw new ApiError(
      400,
      "Vui lòng thiết lập ít nhất 1 tiêu đề Subject lọc trong mục Cài đặt trước khi thêm Gmail mới.",
      "SUBJECT_FILTERS_REQUIRED"
    );
  }

  // 2. Thêm Gmail vào workspace
  const email = input.email.toLowerCase();
  const account = await prisma.gmailAccount.upsert({
    where: { userId_email: { userId, email } },
    create: {
      userId,
      email,
      type: "manual",
      rawJson: toJsonValue({ source: "manual", email })
    },
    update: {
      type: "manual"
    },
    include: { _count: { select: { messages: true } } }
  });

  // 3. Tự động quét inbox và lọc/chuyển tiếp mail ngay lập tức theo tiêu đề đã cài đặt
  try {
    console.log(`[AddGmail] Auto syncing & running batch filter for new Gmail: ${email}...`);
    await syncInbox(userId, email);
    await runAutoForwardBatchForUser(userId);
  } catch (err) {
    console.error(`[AddGmail] Error during initial sync/batch for ${email}:`, err);
  }

  return account;
}

export async function deleteManualAccount(userId: string, email: string) {
  const account = await ownedAccount(userId, email);
  await prisma.gmailAccount.delete({ where: { id: account.id } });
  return { deleted: true };
}

export async function searchAllInboxes(
  userId: string,
  filters: { sender?: string; subject?: string; page: number; limit: number }
) {
  const accounts = await listAccounts(userId);
  if (accounts.length === 0) {
    return { data: [], pagination: { page: filters.page, limit: filters.limit, total: 0, pages: 1 } };
  }
  const accountEmails = accounts.map((a: any) => a.email.toLowerCase());
  const where: Prisma.InboxMessageWhereInput = {
    userId,
    email: { in: accountEmails },
    ...(filters.sender ? { sender: { contains: filters.sender } } : {}),
    ...(filters.subject ? { subject: { contains: filters.subject } } : {})
  };
  const [messages, total] = await Promise.all([
    prisma.inboxMessage.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      select: {
        id: true,
        email: true,
        mid: true,
        sender: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        receivedTs: true,
        isRead: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.inboxMessage.count({ where })
  ]);
  return {
    data: messages,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.max(1, Math.ceil(total / filters.limit))
    }
  };
}

export async function searchAllInboxesFromApi(
  userId: string,
  filters: { sender?: string; subject?: string; page: number; limit: number }
) {
  const accounts = await listAccounts(userId);
  if (accounts.length === 0) {
    return { data: [], pagination: { page: filters.page, limit: filters.limit, total: 0, pages: 1 } };
  }

  const apiKey = await getDecryptedApiKey(userId);
  const allMessages: Array<{
    id: string;
    email: string;
    mid: string;
    sender: string | null;
    subject: string | null;
    snippet: string | null;
    receivedAt: Date | null;
    receivedTs: bigint | null;
    isRead: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Search timeout")), 30000)
  );

  for (const account of accounts) {
    try {
      const timestamp = Number(account.timestamp ?? 0);
      const fetchPromise = sonjj.fetchInbox(apiKey, account.email, timestamp);
      const response = await Promise.race([fetchPromise, timeoutPromise]) as { messages?: Array<Record<string, unknown>> };

      const messages = (response.messages ?? [])
        .map((raw) => ({ raw, normalized: normalizeMessage(raw) }))
        .filter((item) => item.normalized !== null);

      for (const { raw, normalized } of messages) {
        const normalizedMsg = normalized!;
        const existing = await prisma.inboxMessage.findFirst({
          where: { userId, email: account.email, mid: normalizedMsg.mid }
        });

        if (existing) {
          allMessages.push({
            id: existing.id,
            email: existing.email,
            mid: existing.mid,
            sender: existing.sender,
            subject: existing.subject,
            snippet: existing.snippet,
            receivedAt: existing.receivedAt,
            receivedTs: existing.receivedTs,
            isRead: existing.isRead,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt
          });
        } else {
          const created = await prisma.inboxMessage.create({
            data: {
              userId,
              gmailAccountId: account.id,
              email: account.email,
              ...normalizedMsg,
              rawInboxJson: toJsonValue(raw)
            }
          });
          allMessages.push({
            id: created.id,
            email: created.email,
            mid: created.mid,
            sender: created.sender,
            subject: created.subject,
            snippet: created.snippet,
            receivedAt: created.receivedAt,
            receivedTs: created.receivedTs,
            isRead: created.isRead,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt
          });
        }
      }
    } catch (error) {
      console.error(`Error fetching inbox for ${account.email}:`, error);
    }
  }

  let filtered = allMessages;
  if (filters.sender) {
    const senderLower = filters.sender.toLowerCase();
    filtered = filtered.filter((m) => m.sender?.toLowerCase().includes(senderLower));
  }
  if (filters.subject) {
    const subjectLower = filters.subject.toLowerCase();
    filtered = filtered.filter((m) => m.subject?.toLowerCase().includes(subjectLower));
  }

  filtered.sort((a, b) => {
    const dateA = Number(a.receivedAt?.getTime() ?? 0);
    const dateB = Number(b.receivedAt?.getTime() ?? 0);
    return dateB - dateA;
  });

  const total = filtered.length;
  const start = (filters.page - 1) * filters.limit;
  const paginatedData = filtered.slice(start, start + filters.limit);

  return {
    data: paginatedData,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.max(1, Math.ceil(total / filters.limit))
    }
  };
}

export async function searchInbox(
  userId: string,
  email: string,
  filters: { sender?: string; subject?: string; page: number; limit: number }
) {
  await ownedAccount(userId, email);
  const where: Prisma.InboxMessageWhereInput = {
    userId,
    email: email.toLowerCase(),
    ...(filters.sender ? { sender: { contains: filters.sender } } : {}),
    ...(filters.subject ? { subject: { contains: filters.subject } } : {})
  };
  const [messages, total] = await Promise.all([
    prisma.inboxMessage.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      select: {
        id: true,
        email: true,
        mid: true,
        sender: true,
        subject: true,
        snippet: true,
        receivedAt: true,
        receivedTs: true,
        isRead: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.inboxMessage.count({ where })
  ]);
  return {
    data: messages,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      pages: Math.max(1, Math.ceil(total / filters.limit))
    }
  };
}

export async function syncInbox(userId: string, email: string, timestamp?: number) {
  const account = await ownedAccount(userId, email);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inboxTimestamp: true }
  });
  const apiKey = await getDecryptedApiKey(userId);
  const since = timestamp ?? Number(user?.inboxTimestamp ?? account.timestamp ?? 0);
  try {
    const response = await sonjj.fetchInbox(apiKey, account.email, since);
    const messages = (response.messages ?? [])
      .map((raw) => ({ raw, normalized: normalizeMessage(raw) }))
      .filter((item) => item.normalized !== null);
    await prisma.$transaction([
      ...messages.map(({ raw, normalized }) =>
        prisma.inboxMessage.upsert({
          where: { userId_email_mid: { userId, email: account.email, mid: normalized!.mid } },
          create: {
            userId,
            gmailAccountId: account.id,
            email: account.email,
            ...normalized!,
            rawInboxJson: toJsonValue(raw)
          },
          update: {
            sender: normalized!.sender,
            subject: normalized!.subject,
            snippet: normalized!.snippet,
            receivedAt: normalized!.receivedAt,
            receivedTs: normalized!.receivedTs,
            rawInboxJson: toJsonValue(raw)
          }
        })
      ),
      prisma.gmailAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date() }
      })
    ]);
    await logFetch({
      userId,
      action: "fetch_inbox",
      endpoint: "/v1/temp_gmail/inbox",
      requestParams: { email: account.email, timestamp: since },
      status: "success"
    });
    return { synced: messages.length };
  } catch (error) {
    await logFetch({
      userId,
      action: "fetch_inbox",
      endpoint: "/v1/temp_gmail/inbox",
      requestParams: { email: account.email, timestamp: since },
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  }
}

export async function getMessage(userId: string, email: string, mid: string) {
  await ownedAccount(userId, email);
  const message = await prisma.inboxMessage.findFirst({
    where: { userId, email: email.toLowerCase(), mid }
  });
  if (!message) throw new ApiError(404, "Không tìm thấy message.", "MESSAGE_NOT_FOUND");
  if (!message.isRead) {
    return prisma.inboxMessage.update({ where: { id: message.id }, data: { isRead: true } });
  }
  return message;
}

export async function syncMessage(userId: string, email: string, mid: string) {
  const account = await ownedAccount(userId, email);
  const existing = await prisma.inboxMessage.findFirst({
    where: { userId, email: account.email, mid }
  });
  if (!existing) throw new ApiError(404, "Hãy đồng bộ inbox trước khi tải message.", "MESSAGE_NOT_FOUND");
  const apiKey = await getDecryptedApiKey(userId);
  try {
    const response = await sonjj.fetchMessage(apiKey, account.email, mid);
    const body = text(first(response, ["body", "html", "content", "message"])) ?? "";
    const message = await prisma.inboxMessage.update({
      where: { id: existing.id },
      data: { body, rawMessageJson: toJsonValue(response), isRead: true }
    });
    await logFetch({
      userId,
      action: "fetch_message",
      endpoint: "/v1/temp_gmail/message",
      requestParams: { email: account.email, mid },
      status: "success"
    });
    return message;
  } catch (error) {
    await logFetch({
      userId,
      action: "fetch_message",
      endpoint: "/v1/temp_gmail/message",
      requestParams: { email: account.email, mid },
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error"
    });
    throw error;
  }
}
