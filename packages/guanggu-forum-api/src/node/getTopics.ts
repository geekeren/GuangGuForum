import { domStructure, TopicSummary } from "../getRecentTopics";
import { request } from "../client";
import { getDataFromHtml } from "../utils/getDataFromHtml";
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
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(getDataFromHtml(body, domStructure) as TopicSummary[])
      : undefined,
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as TopicSummary[];
  });
};
