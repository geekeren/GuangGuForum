import { describe, it, expect } from "vitest";
import { formatReplySummary } from "../replySummary";

describe("reply count heading", () => {
  it("removes the trailing date and time but keeps the reply count", () => {
    expect(formatReplySummary("共收到 12 条回复 2026-10-31 15:00:00")).toBe("共收到 12 条回复");
    expect(formatReplySummary("共收到88个回复 · 最后回复于 2 小时前")).toBe("共收到88个回复");
  });
  it("preserves count-only and unknown formats", () => {
    expect(formatReplySummary("共收到 0 条回复")).toBe("共收到 0 条回复");
    expect(formatReplySummary("暂无回复")).toBe("暂无回复");
  });
});
