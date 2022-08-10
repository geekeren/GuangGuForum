import { domStructure, TopicSummary } from "../getRecentTopics";
import { request } from "../client";
import { getDataFromHtml } from "../utils/getDataFromHtml";



export interface GetNodeTopicsParam {
  node: string,
  page: number,
}

export function getNodeTopics(param: GetNodeTopicsParam): Promise<TopicSummary[]> {
  const { node, page = 1 } = param;

  return request(`/node/${node}`, {
    query: {
      p: String(page),
    }
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as TopicSummary[];
  });
}
