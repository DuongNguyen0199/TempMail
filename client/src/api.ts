import { logger } from "./logger";

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: any) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const startTime = Date.now();
  const method = options.method || "GET";
  let reqBody: any = undefined;

  if (options.body && typeof options.body === "string") {
    try {
      reqBody = JSON.parse(options.body);
    } catch {
      reqBody = options.body;
    }
  }

  try {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers
      }
    });

    const duration = Date.now() - startTime;

    if (response.status === 204) {
      logger.apiCall(method, path, reqBody, response.status, null, duration);
      return undefined as T;
    }

    const body = await response.json().catch(() => ({}));

    logger.apiCall(method, path, reqBody, response.status, body, duration);

    if (!response.ok) {
      const errorMsg = body?.error?.message ?? `Lỗi HTTP ${response.status}: Không thể hoàn tất yêu cầu.`;
      const errorCode = body?.error?.code ?? "API_ERROR";
      const err = new ApiClientError(response.status, errorMsg, errorCode, body);
      
      logger.error("API_RESPONSE_ERROR", `Yêu cầu ${method} ${path} thất bại [HTTP ${response.status}]`, err, {
        path,
        status: response.status,
        responseBody: body
      });

      throw err;
    }

    return body as T;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    if (!(err instanceof ApiClientError)) {
      logger.error("API_NETWORK_ERROR", `Lỗi kết nối mạng tới ${method} ${path}`, err, { duration });
    }
    throw err;
  }
}
