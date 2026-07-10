import { describe, expect, it } from "vitest";
import { initials, senderName } from "./utils";

describe("mail display helpers", () => {
  it("extracts sender names and initials", () => {
    expect(senderName('"Sonjj Team" <hello@sonjj.com>')).toBe("Sonjj Team");
    expect(initials("Sonjj Team")).toBe("ST");
  });
});
