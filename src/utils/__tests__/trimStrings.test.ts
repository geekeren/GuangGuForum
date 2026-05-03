import { describe, it, expect } from "vitest";
import { trimStrings } from "../trimStrings";

describe("trimStrings", () => {
  it("trims a plain string", () => {
    expect(trimStrings("  hello  ")).toBe("hello");
  });

  it("returns already-trimmed string unchanged", () => {
    expect(trimStrings("hello")).toBe("hello");
  });

  it("trims all strings in an array", () => {
    expect(trimStrings(["  a  ", " b ", "c"])).toEqual(["a", "b", "c"]);
  });

  it("trims all string values in a flat object", () => {
    expect(trimStrings({ name: "  Alice  ", city: " NYC " })).toEqual({
      name: "Alice",
      city: "NYC",
    });
  });

  it("trims strings in a nested object", () => {
    const input = {
      user: { name: "  Bob  ", bio: " dev " },
      tags: ["  ts  ", " react "],
    };
    expect(trimStrings(input)).toEqual({
      user: { name: "Bob", bio: "dev" },
      tags: ["ts", "react"],
    });
  });

  it("preserves non-string values", () => {
    const input = { name: "  Alice  ", age: 30, active: true };
    expect(trimStrings(input)).toEqual({ name: "Alice", age: 30, active: true });
  });

  it("preserves null values", () => {
    expect(trimStrings({ val: null })).toEqual({ val: null });
  });

  it("preserves undefined values", () => {
    expect(trimStrings({ val: undefined })).toEqual({ val: undefined });
  });

  it("handles empty string", () => {
    expect(trimStrings("")).toBe("");
  });

  it("handles empty array", () => {
    expect(trimStrings([])).toEqual([]);
  });

  it("handles empty object", () => {
    expect(trimStrings({})).toEqual({});
  });

  it("returns number as-is", () => {
    expect(trimStrings(42)).toBe(42);
  });

  it("returns boolean as-is", () => {
    expect(trimStrings(true)).toBe(true);
  });

  it("returns null as-is", () => {
    expect(trimStrings(null)).toBeNull();
  });

  it("trims deeply nested arrays inside objects", () => {
    const input = { items: [{ name: "  a  " }, { name: " b " }] };
    expect(trimStrings(input)).toEqual({ items: [{ name: "a" }, { name: "b" }] });
  });
});
