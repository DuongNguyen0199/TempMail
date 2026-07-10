import axios, { AxiosError } from "axios";
import { config } from "../config.js";
import { ApiError } from "../lib/api-error.js";

const client = axios.create({
  baseURL: config.SONJJ_BASE_URL,
  timeout: config.API_TIMEOUT_MS,
  headers: { Accept: "application/json" }
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function upstreamError(error: AxiosError): ApiError {
  const status = error.response?.status ?? 502;
  const body = error.response?.data as { error?: { message?: string }; detail?: unknown } | undefined;
  const messages: Record<number, string> = {
    401: "API key Sonjj không hợp lệ.",
    402: "Tài khoản Sonjj không đủ credit.",
    403: "Gói Sonjj hiện tại không có quyền dùng endpoint này.",
    404: "Không tìm thấy dữ liệu trên Sonjj.",
    422: "Sonjj từ chối tham số được gửi lên.",
    429: "Sonjj đang giới hạn tần suất. Vui lòng thử lại sau.",
    500: "Dịch vụ Sonjj đang gặp lỗi."
  };
  const message = body?.error?.message ?? messages[status] ?? "Không thể hoàn tất yêu cầu tới Sonjj.";
  return new ApiError(status === 429 ? 429 : 502, message, `SONJJ_${status}`, body?.detail);
}

async function get<T>(path: string, apiKey: string, params?: Record<string, unknown>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const response = await client.get<T>(path, {
        params,
        headers: { "X-Api-Key": apiKey }
      });
      return response.data;
    } catch (error) {
      if (!(error instanceof AxiosError)) throw error;
      if (error.response?.status === 429 && attempt < 2) {
        const retryHeader = Number(error.response.headers["retry-after"]);
        const delay = Number.isFinite(retryHeader)
          ? Math.min(retryHeader * 1000, 10000)
          : 750 * 2 ** attempt;
        attempt += 1;
        await wait(delay);
        continue;
      }
      throw upstreamError(error);
    }
  }
}

export type GmailListResponse = {
  data?: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown>;
};

export type InboxResponse = {
  messages?: Array<Record<string, unknown>>;
};

export async function listGmail(
  apiKey: string,
  params: { page: number; limit: number; type?: string; password?: string }
) {
  return get<GmailListResponse>("/v1/temp_gmail/list", apiKey, params);
}

export async function fetchInbox(apiKey: string, email: string, timestamp: number) {
  return get<InboxResponse>("/v1/temp_gmail/inbox", apiKey, { email, timestamp });
}

export async function fetchMessage(apiKey: string, email: string, mid: string) {
  return get<Record<string, unknown>>("/v1/temp_gmail/message", apiKey, { email, mid });
}

export async function validateKey(apiKey: string) {
  return listGmail(apiKey, { page: 1, limit: 1 });
}
