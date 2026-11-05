interface ViewportMeasurements {
  baselineHeight?: number;
  viewportHeight?: number;
  baselineBottom?: number;
  viewportBottom?: number;
}

function isMeasuredHeight(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// Same-probe bottom coordinates capture translation as well as viewport resizing.
export function resolveViewportInset({ baselineHeight, viewportHeight, baselineBottom, viewportBottom }: ViewportMeasurements): number {
  if (typeof baselineBottom === "number" && Number.isFinite(baselineBottom)
    && typeof viewportBottom === "number" && Number.isFinite(viewportBottom)) {
    return Math.max(0, baselineBottom - viewportBottom);
  }
  if (!isMeasuredHeight(baselineHeight) || !isMeasuredHeight(viewportHeight)) return 0;
  return Math.max(0, baselineHeight - viewportHeight);
}

export function resolveKeyboardDockInset(
  measurements: ViewportMeasurements & { keyboardHeight: number },
): number {
  const height = measurements.keyboardHeight;
  if (!Number.isFinite(height) || height <= 0) return 0;
  return height - resolveViewportInset(measurements);
}
