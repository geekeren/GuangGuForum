export type DesktopEditorBounds = { left: number; width: number; bottom: number; viewportWidth: number; viewportHeight?: number };
type Rect = { left?: number; width?: number; bottom?: number } | undefined;

/** Keep the portal in viewport coordinates while narrowing only its interactive column. */
export function measureDesktopEditorBounds(editor: Rect, viewport: Rect, windowWidth: number, windowHeight?: number): DesktopEditorBounds | undefined {
  if (windowHeight !== undefined && (!Number.isFinite(windowHeight) || windowHeight <= 0)) return;
  if (!Number.isFinite(windowWidth) || windowWidth <= 0 || !editor || !viewport || !Number.isFinite(editor.left) || !Number.isFinite(editor.width) || !Number.isFinite(viewport.bottom)) return;
  const left = Math.max(0, editor.left!);
  const right = Math.min(windowWidth, editor.left! + editor.width!);
  const width = right - left;
  if (width <= 0 || viewport.bottom! <= 0) return;
  return { left, width, bottom: viewport.bottom!, viewportWidth: windowWidth, ...(windowHeight === undefined ? {} : { viewportHeight: windowHeight }) };
}
