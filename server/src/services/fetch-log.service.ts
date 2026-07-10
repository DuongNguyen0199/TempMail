import { prisma } from "../db.js";
import { toJsonValue } from "../lib/json.js";

export async function logFetch(input: {
  userId: string;
  action: string;
  endpoint: string;
  requestParams?: Record<string, unknown>;
  status: "success" | "error";
  errorMessage?: string;
}) {
  await prisma.fetchLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      endpoint: input.endpoint,
      requestParams: input.requestParams ? toJsonValue(input.requestParams) : undefined,
      status: input.status,
      errorMessage: input.errorMessage
    }
  });
}
