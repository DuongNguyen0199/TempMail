import type { NextFunction, Request, Response } from "express";
import { AxiosError } from "axios";
import { ZodError } from "zod";
import { ApiError } from "../lib/api-error.js";

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Không tìm thấy ${req.method} ${req.path}.`, "NOT_FOUND"));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ.",
        details: error.flatten()
      }
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details }
    });
    return;
  }

  if (error instanceof AxiosError) {
    res.status(502).json({
      error: { code: "UPSTREAM_ERROR", message: "Không thể kết nối dịch vụ Sonjj." }
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Máy chủ gặp lỗi ngoài dự kiến." }
  });
}
