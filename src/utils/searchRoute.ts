export function decodeSearchRouteValue(value = "") {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function getPlaceholderTopicRoute(keyword: string, topic?: { topicLink: string }) {
  if (keyword.trim()) return undefined;
  const tid = topic?.topicLink.match(/^\/t\/(\d+)(?:[?#].*)?$/)?.[1];
  return tid ? `/pages/topicDetail/index?tid=${tid}` : undefined;
}

export function buildSearchRoute(node?: string, nodeName?: string) {
  if (!node) return "/pages/search/index";
  return `/pages/search/index?node=${encodeURIComponent(node)}&nodeName=${encodeURIComponent(nodeName || "")}`;
}
