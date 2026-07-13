import { describe, expect, it } from "vitest";
import { validateReason } from "@/server/transactions/reason";

describe("reason validation", () => {
  it.each([
    ["zero-width space", "\u200B"],
    ["bidirectional override", "\u202E"],
    ["NUL", "\u0000"],
    ["embedded format control", "Visible\u200Btext"],
  ])("rejects %s", (_label, reason) => {
    expect(validateReason(reason)).toEqual({
      ok: false,
      kind: "invalid",
    });
  });

  it("accepts visible Unicode and stores normalized NFC text", () => {
    expect(validateReason("  Cafe\u0301 résumé — 二次確認 ✅  ")).toEqual({
      ok: true,
      value: "Café résumé — 二次確認 ✅",
    });
  });

  it("preserves intentional internal multiline text and tabs", () => {
    expect(validateReason("  First line\nSecond\tline\r\nThird line  ")).toEqual({
      ok: true,
      value: "First line\nSecond\tline\r\nThird line",
    });
  });

  it("rejects empty, whitespace-only, and oversized text", () => {
    expect(validateReason(" \n\t ")).toEqual({
      ok: false,
      kind: "required",
    });
    expect(validateReason("a".repeat(1001))).toEqual({
      ok: false,
      kind: "invalid",
    });
  });
});
