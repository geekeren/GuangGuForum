import { parseTopicSummaries, TopicSummary } from "../getRecentTopics";
import { request } from "../client";
import { CacheAPIFunc } from "../types";

export interface GetNodeTopicsParam {
  node: string;
  page: number;
}

export const getNodeTopics: CacheAPIFunc<GetNodeTopicsParam, TopicSummary[]> = (
  param,
  options?,
) => {
  const { node, page = 1 } = param;
  const cache = options?.cache ?? true;

  return request(`/node/${node}`, {
    cache,
    cacheApi: "getNodeTopics",
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(parseTopicSummaries(body))
      : undefined,
  }).then(({ body }) => {
    return parseTopicSummaries(body);
  });
};
