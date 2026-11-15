/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { fence, noticeToken } from "../../convex/keiki/notice";

const KEY = "sk_test_0123456789abcdef";

describe("notice fence", () => {
  it("derives the same 16 character token for the same key", () => {
    expect(noticeToken(KEY)).toBe("0814b2bd937dcd2f");
    expect(noticeToken(KEY)).toBe(noticeToken(KEY));
    expect(noticeToken(KEY)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes with the key, so a rotated key shows up as a mismatch", () => {
    expect(noticeToken(KEY)).not.toBe(noticeToken(KEY + "x"));
    expect(noticeToken(KEY)).not.toBe(noticeToken("sk_live_0123456789abcdef"));
    expect(noticeToken("")).toHaveLength(16);
  });

  it("wraps a notice behind its own first line", () => {
    const text = fence(noticeToken(KEY)) + "\nIt's on. You, Maya.";
    const [first, ...rest] = text.split("\n");
    expect(first).toBe("FROLIC-OPS 0814b2bd937dcd2f");
    expect(rest.join("\n")).toBe("It's on. You, Maya.");
  });

  it("puts the same fence in the prompt the agent is synced with", () => {
    const files = import.meta.glob("../../keiki/prompt-addendum.md", { query: "?raw", eager: true, import: "default" }) as Record<string, string>;
    const addendum = Object.values(files)[0];
    expect(typeof addendum).toBe("string");
    expect(addendum).toContain("FROLIC-OPS {{NOTICE_TOKEN}}");
    const rendered = addendum.replace("{{NOTICE_TOKEN}}", noticeToken(KEY));
    expect(rendered).toContain("FROLIC-OPS " + noticeToken(KEY));
    expect(rendered).toContain("This is the one time you call no tool");
    expect(rendered).not.toContain("{{NOTICE_TOKEN}}");
  });
});
