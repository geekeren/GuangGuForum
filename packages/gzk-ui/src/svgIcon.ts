// Native Image is a separate SVG document: DOM/CSS currentColor cannot cross it.
// Resolve the container's color at this boundary; keep one vector source per icon.
export function svgIconSource(source: string, color: string): string {
  const svg = source.replace(/currentColor/g, color);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
