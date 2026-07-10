export function formatMessageTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {})
  }).format(date);
}

export function senderName(sender?: string | null): string {
  if (!sender) return "Người gửi không xác định";
  const match = sender.match(/^"?([^"<]+)"?\s*</);
  return match?.[1]?.trim() || sender;
}

export function initials(value: string): string {
  return value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "SM";
}
