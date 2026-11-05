import { describe, expect, it } from 'vitest';
import { resolveKeyboardDockInset, resolveViewportInset } from '../keyboardDockPosition';

describe('floating keyboard dock geometry', () => {
  it('reserves the keyboard height when the viewport does not move', () => {
    expect(resolveKeyboardDockInset({ keyboardHeight: 300, baselineHeight: 844, viewportHeight: 844 })).toBe(300);
  });

  it('does not raise the toolbar twice when the viewport already shrinks', () => {
    expect(resolveKeyboardDockInset({ keyboardHeight: 300, baselineHeight: 844, viewportHeight: 544 })).toBe(0);
  });

  it('uses the same probe bottom to account for translation without resizing', () => {
    const geometry = { baselineHeight: 844, viewportHeight: 844, baselineBottom: 844, viewportBottom: 644 };
    expect(resolveViewportInset(geometry)).toBe(200);
    expect(resolveKeyboardDockInset({ ...geometry, keyboardHeight: 300 })).toBe(100);
  });

  it('prefers bottom coordinates over height changes', () => {
    const geometry = { baselineHeight: 844, viewportHeight: 544, baselineBottom: 844, viewportBottom: 594 };
    expect(resolveViewportInset(geometry)).toBe(250);
    expect(resolveKeyboardDockInset({ ...geometry, keyboardHeight: 300 })).toBe(50);
  });

  it('can compensate a viewport inset larger than the keyboard', () => {
    // The signed inset anchors the overlay to the original screen coordinates.
    expect(resolveKeyboardDockInset({ keyboardHeight: 300, baselineBottom: 844, viewportBottom: 444 })).toBe(-100);
  });

  it('does not treat viewport growth as a keyboard inset', () => {
    expect(resolveViewportInset({ baselineHeight: 844, viewportHeight: 900 })).toBe(0);
    expect(resolveViewportInset({ baselineBottom: 844, viewportBottom: 900 })).toBe(0);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('returns zero for an invalid or closed keyboard: %s', keyboardHeight => {
    expect(resolveKeyboardDockInset({ keyboardHeight, baselineBottom: 844, viewportBottom: 544 })).toBe(0);
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('falls back safely when measured height is missing or invalid: %s', viewportHeight => {
    expect(resolveViewportInset({ baselineHeight: 844, viewportHeight })).toBe(0);
    expect(resolveKeyboardDockInset({ keyboardHeight: 300, baselineHeight: 844, viewportHeight })).toBe(300);
  });

  it('falls back to height measurements when bottom coordinates are incomplete', () => {
    expect(resolveViewportInset({ baselineHeight: 844, viewportHeight: 544, baselineBottom: Number.NaN, viewportBottom: 544 })).toBe(300);
    expect(resolveViewportInset({ baselineHeight: 844, viewportHeight: 544, baselineBottom: 844 })).toBe(300);
    expect(resolveViewportInset({})).toBe(0);
  });
});
