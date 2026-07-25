export type User = {
  id: string;
  email: string;
  username?: string | null;
  createdAt: string;
};

export type GmailAccount = {
  id: string;
  email: string;
  type?: string | null;
  timestamp?: string | null;
  lastSyncedAt?: string | null;
  updatedAt: string;
  _count: { messages: number };
};

export type InboxMessage = {
  id: string;
  email: string;
  mid: string;
  sender?: string | null;
  subject?: string | null;
  snippet?: string | null;
  receivedAt?: string | null;
  receivedTs?: string | null;
  isRead: boolean;
  body?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OsMail = {
  id: string;
  email: string;
  mid: string;
  sender?: string | null;
  subject?: string | null;
  snippet?: string | null;
  body?: string | null;
  receivedAt?: string | null;
  status: "PENDING" | "FORWARDED" | "FAILED";
  forwardedAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export type AutoForwardConfig = {
  enabled: boolean;
  targetEmail: string;
  subjects: string[];
  mailProvider: "smtp" | "resend" | "brevo";
  fromEmail?: string;
  apiSecretConfigured?: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassConfigured: boolean;
  updatedAt: string;
};
