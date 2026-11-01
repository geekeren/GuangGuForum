export function formatReplySummary(summary: string) {
  return summary.match(/共收到\s*[\d,]+\s*(?:条|个)?\s*回复/)?.[0] || summary;
}
