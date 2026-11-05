export interface TopicFormatStatus {
  available: boolean;
  bold: boolean;
  italic: boolean;
  header: 1 | 2 | 3 | null;
  list: 'bullet' | 'ordered' | null;
}

export const EMPTY_FORMAT_STATUS: TopicFormatStatus = { available: false, bold: false, italic: false, header: null, list: null };

export function parseNativeEditorStatus(detail: unknown): TopicFormatStatus {
  const value = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
  return {
    available: true,
    bold: value.bold === true || value.bold === 'true' || value.bold === 'strong',
    italic: value.italic === true || value.italic === 'true' || value.italic === 'em',
    header: value.header === 1 || value.header === 2 || value.header === 3 ? value.header : null,
    list: value.list === 'bullet' || value.list === 'ordered' ? value.list : null,
  };
}

export function sameFormatStatus(left: TopicFormatStatus, right: TopicFormatStatus): boolean {
  return left.available === right.available && left.bold === right.bold && left.italic === right.italic
    && left.header === right.header && left.list === right.list;
}
