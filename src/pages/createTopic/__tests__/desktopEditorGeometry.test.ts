import { describe, expect, it } from "vitest";
import { measureDesktopEditorBounds } from "../desktopEditorGeometry";

describe("desktop editor portal geometry", () => {
  it("uses measured column coordinates and clamps width without narrowing the window probe", () => {
    expect(measureDesktopEditorBounds({ left: 240, width: 600 }, { bottom: 876 }, 1280)).toEqual({ left: 240, width: 600, bottom: 876, viewportWidth: 1280 });
    expect(measureDesktopEditorBounds({ left: -100, width: 600 }, { bottom: 876 }, 1280)?.width).toBe(500);
    expect(measureDesktopEditorBounds({ left: -100, width: 50 }, { bottom: 876 }, 1280)).toBeUndefined();
    expect(measureDesktopEditorBounds({ left: 900, width: 600 }, { bottom: 876 }, 1024)?.width).toBe(124);
  });
  it("withholds a desktop interactive host until valid column geometry exists", () => {
    expect(measureDesktopEditorBounds(undefined, { bottom: 876 }, 1280)).toBeUndefined();
    expect(measureDesktopEditorBounds({ left: 240, width: 0 }, { bottom: 876 }, 1280)).toBeUndefined();
    expect(measureDesktopEditorBounds({ left: 240, width: 600 }, { bottom: NaN }, 1280)).toBeUndefined();
  });
});
