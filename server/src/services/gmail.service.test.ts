import { describe, expect, it } from "vitest";
import { normalizeMessage } from "./gmail.service.js";

describe("normalizeMessage", () => {
  it("normalizes the common Sonjj message shape", () => {
    expect(normalizeMessage({
      mid: "abc-123",
      from: "sender@example.com",
      subject: "Welcome",
      snippet: "Hello there",
      timestamp: 1_700_000_000
    })).toMatchObject({
      mid: "abc-123",
      sender: "sender@example.com",
      subject: "Welcome",
      snippet: "Hello there",
      receivedTs: 1_700_000_000
    });
  });

  it("normalizes SmailPro text fields from inbox responses", () => {
    expect(normalizeMessage({
      mid: "19eff18a7d357dd1",
      textFrom: "OpenRouter Team ",
      textSubject: "How provider data policies work on OpenRouter",
      textDate: "Thu, 25 Jun 2026 14:04:23 +0000"
    })).toMatchObject({
      mid: "19eff18a7d357dd1",
      sender: "OpenRouter Team",
      subject: "How provider data policies work on OpenRouter",
      receivedAt: new Date("Thu, 25 Jun 2026 14:04:23 +0000")
    });
  });

  it("supports alternate field names and rejects records without id", () => {
    expect(normalizeMessage({
      messageId: 42,
      sender: { address: "robot@example.com" },
      title: "Code",
      preview: "123456"
    })).toMatchObject({ mid: "42", sender: "robot@example.com", subject: "Code" });
    expect(normalizeMessage({ subject: "No id" })).toBeNull();
  });
});
