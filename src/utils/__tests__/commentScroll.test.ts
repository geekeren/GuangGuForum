import { afterEach, describe, expect, it, vi } from "vitest";
import { CommentScrollGeometry, getCommentScrollTop, startCommentScroll } from "../commentScroll";

function geometry(scrollTop = 0, targetOffset = 700, height = 2000): CommentScrollGeometry {
  return {
    target: { top: 80 + targetOffset - scrollTop, bottom: 180 + targetOffset - scrollTop, height: 100 },
    viewport: { top: 80, bottom: 680, height: 600 },
    navbar: { top: 0, bottom: 80, height: 80 },
    scroll: { scrollTop, scrollHeight: height },
  };
}

afterEach(() => vi.useRealTimers());

describe("measured comment scroll geometry", () => {
  it("uses ScrollView coordinates and does not subtract an in-flow navbar twice", () => {
    expect(getCommentScrollTop(geometry())).toBe(692);
    expect(getCommentScrollTop(geometry(300))).toBe(692);
  });
  it("compensates only for actual fixed Navbar overlap", () => {
    const layout = geometry();
    layout.viewport = { top: 0, bottom: 600, height: 600 };
    expect(getCommentScrollTop(layout)).toBe(692);
  });
  it("clamps to available content and ignores nodes not rendered yet", () => {
    expect(getCommentScrollTop(geometry(0, 10))).toBe(2);
    expect(getCommentScrollTop(geometry(0, 1900))).toBe(1400);
    expect(getCommentScrollTop({ ...geometry(), target: null })).toBeUndefined();
    expect(getCommentScrollTop({ ...geometry(), target: { top: 0, bottom: 0, height: 0 } })).toBeUndefined();
  });
});

describe("async native comment positioning", () => {
  it("waits for native nextTick, retries missing render, and corrects later image layout", () => {
    vi.useFakeTimers();
    let nativeCommit: (() => void) | undefined;
    let measurements = 0;
    let scrollTop = 0;
    const apply = vi.fn((top: number) => { scrollTop = top; });
    const settled = vi.fn();
    const cancel = startCommentScroll({
      nextTick: (callback) => { nativeCommit = callback; },
      measure: (callback) => {
        measurements += 1;
        callback(measurements < 3 ? {} : geometry(scrollTop, measurements < 6 ? 700 : 900, measurements < 6 ? 2000 : 2200));
      },
      apply, settled,
    });
    expect(apply).not.toHaveBeenCalled();
    for (let i = 0; i < 11; i += 1) { nativeCommit?.(); nativeCommit = undefined; vi.advanceTimersByTime(100); }
    expect(apply.mock.calls.map(([top]) => top)).toEqual([692, 892]);
    expect(settled).toHaveBeenCalledOnce();
    cancel();
  });
  it("cancels pending native query callbacks and retry timers on unmount or touch", () => {
    vi.useFakeTimers();
    let measured: ((layout: CommentScrollGeometry) => void) | undefined;
    const apply = vi.fn();
    const measure = vi.fn((callback) => { measured = callback; });
    const cancel = startCommentScroll({ nextTick: (cb) => cb(), measure, apply });
    cancel();
    measured?.(geometry());
    vi.runAllTimers();
    expect(apply).not.toHaveBeenCalled();
    expect(measure).toHaveBeenCalledOnce();
  });
  it("bounds retries when a reply was removed before native rendering", () => {
    vi.useFakeTimers();
    const settled = vi.fn();
    const measure = vi.fn((callback) => callback({}));
    const cancel = startCommentScroll({ nextTick: (cb) => cb(), measure, apply: vi.fn(), settled });
    vi.runAllTimers();
    expect(measure).toHaveBeenCalledTimes(20);
    expect(settled).toHaveBeenCalledOnce();
    cancel();
  });
});
