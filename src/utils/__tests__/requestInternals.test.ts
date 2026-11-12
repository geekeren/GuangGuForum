import { afterEach, describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { ParsedHtmlCache } from "../../../packages/guanggu-forum-api/src/request/parsedHtmlCache";
import { RequestRevisions } from "../../../packages/guanggu-forum-api/src/request/revisions";

const document = parse("<body>topic</body>");
afterEach(() => vi.useRealTimers());

describe("parsed request document cache", () => {
  it("evicts the least recently read document at the capacity boundary", () => {
    const cache = new ParsedHtmlCache(2);
    cache.remember("a", "first", document);
    cache.remember("b", "second", document);
    expect(cache.get("a")?.body).toBe(document);
    cache.remember("c", "third", document);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.html).toBe("first");
    expect(cache.get("c")?.html).toBe("third");
  });

  it("expires at the TTL boundary without extending lifetime on reads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const cache = new ParsedHtmlCache(2, 100);
    cache.remember("a", "first", document);
    vi.setSystemTime(1099);
    expect(cache.get("a")).toBeDefined();
    vi.setSystemTime(1100);
    expect(cache.get("a")).toBeUndefined();
  });

  it("discards documents after clock rollback and account-cache replacement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const cache = new ParsedHtmlCache();
    cache.remember("a", "first", document);
    vi.setSystemTime(999);
    expect(cache.get("a")).toBeUndefined();
    cache.remember("b", "second", document);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
  });
});

describe("request revision ownership", () => {
  it("does not allow an older response to publish after the newer request finishes", () => {
    const revisions = new RequestRevisions();
    const old = revisions.start("same-account-and-url", () => true);
    const newest = revisions.start("same-account-and-url", () => true);
    expect(old.current()).toBe(false);
    expect(newest.current()).toBe(true);
    newest.finish();
    expect(old.current()).toBe(false);
    old.finish();
    expect(revisions.start("same-account-and-url", () => true).current()).toBe(
      true,
    );
  });

  it("isolates request keys and invalidates publication when scope changes", () => {
    const revisions = new RequestRevisions();
    let currentAccount = true;
    const first = revisions.start("first-url", () => currentAccount);
    const second = revisions.start("second-url", () => true);
    expect(first.current()).toBe(true);
    expect(second.current()).toBe(true);
    currentAccount = false;
    expect(first.current()).toBe(false);
    expect(second.current()).toBe(true);
    first.finish();
    second.finish();
  });
});
