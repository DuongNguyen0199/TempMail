import { prisma } from "../db.js";
import { ApiError } from "../lib/api-error.js";
import { decryptSecret, encryptSecret, maskSecret } from "../lib/crypto.js";

const provider = "sonjj_smailpro";

export async function getApiConfig(userId: string) {
  const config = await prisma.userApiConfig.findUnique({
    where: { userId_provider: { userId, provider } }
  });
  if (!config) return { configured: false, maskedKey: null, updatedAt: null };
  const key = decryptSecret(config.apiKeyEncrypted);
  return { configured: true, maskedKey: maskSecret(key), updatedAt: config.updatedAt };
}

export async function saveApiKey(userId: string, apiKey: string) {
  const encrypted = encryptSecret(apiKey.trim());
  const config = await prisma.userApiConfig.upsert({
    where: { userId_provider: { userId, provider } },
    create: { userId, provider, apiKeyEncrypted: encrypted },
    update: { apiKeyEncrypted: encrypted }
  });
  return { configured: true, maskedKey: maskSecret(apiKey.trim()), updatedAt: config.updatedAt };
}

export async function deleteApiKey(userId: string) {
  await prisma.userApiConfig.deleteMany({ where: { userId, provider } });
}

export async function getInboxTimestamp(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { inboxTimestamp: true }
  });
  if (!user) {
    throw new ApiError(401, "Tài khoản không còn tồn tại.", "USER_NOT_FOUND");
  }
  return { inboxTimestamp: user.inboxTimestamp.toString() };
}

export async function saveInboxTimestamp(userId: string, inboxTimestamp: number) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { inboxTimestamp: BigInt(inboxTimestamp) },
    select: { inboxTimestamp: true }
  });
  return { inboxTimestamp: user.inboxTimestamp.toString() };
}

export async function getDecryptedApiKey(userId: string): Promise<string> {
  const config = await prisma.userApiConfig.findUnique({
    where: { userId_provider: { userId, provider } }
  });
  if (!config) {
    throw new ApiError(400, "Hãy cấu hình API key Sonjj trong phần Hồ sơ trước.", "API_KEY_REQUIRED");
  }
  return decryptSecret(config.apiKeyEncrypted);
}
