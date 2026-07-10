export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
