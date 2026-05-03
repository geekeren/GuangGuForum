import { request } from "../client";
import { getDataFromHtml } from "../utils/getDataFromHtml";
import { HotNodes, getHotNodes as getHotNodesOriginal } from "../node/getHotNodes";
import { CacheAPIFunc } from "../types";

export interface HotTopic {
  username: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  topicLink: string;
}

export interface InterestTopic {
  username: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  topicLink: string;
  category: string;
  categoryLink: string;
  lastTouched: string;
  commentCount: string;
}

export interface InterestNode {
  title: string;
  link: string;
  slug: string;
}

export function getHotTopics(): Promise<HotTopic[]> {
  return request("/", { cache: true }).then(({ body }) => {
    if (!body) return [];
    const topics = getDataFromHtml(body, {
      _selector: ".hot-topics .cell",
      _type: "array",
      _item: "object",
      _attribute: "",
      userLink: { _selector: "a", _attribute: "href", _type: "string" },
      userAvatarUrl: { _selector: "a img.avatar", _attribute: "src", _type: "string" },
      title: { _selector: ".hot_topic_title a", _attribute: "", _type: "string" },
      topicLink: { _selector: ".hot_topic_title a", _attribute: "href", _type: "string" },
    }) as unknown as { userLink: string; userAvatarUrl: string; title: string; topicLink: string }[];

    return topics.map((t) => ({
      ...t,
      username: t.userLink?.replace("/u/", "") || "",
    }));
  });
}

export interface GetInterestTopicsParam {
  page?: number;
}

export function getInterestTopics(
  param?: GetInterestTopicsParam,
): Promise<{ topics: InterestTopic[]; nodes: InterestNode[] }> {
  const { page = 1 } = param || {};
  return request("/", {
    cache: true,
    query: {
      tab: "interest",
      p: String(page),
    },
  }).then(({ body }) => {
    if (!body) return { topics: [], nodes: [] };
    const topics = getDataFromHtml(body, {
      _selector: ".topics .topic-item",
      _type: "array",
      _item: "object",
      _attribute: "",
      username: { _selector: ".meta .username a", _attribute: "", _type: "string" },
      userLink: { _selector: "a", _attribute: "href", _type: "string" },
      userAvatarUrl: { _selector: "a img.avatar", _attribute: "src", _type: "string" },
      title: { _selector: ".main .title a", _attribute: "", _type: "string" },
      topicLink: { _selector: ".main .title a", _attribute: "href", _type: "string" },
      category: { _selector: ".meta .node a", _attribute: "", _type: "string" },
      categoryLink: { _selector: ".meta .node a", _attribute: "href", _type: "string" },
      lastTouched: { _selector: ".meta .last-touched", _attribute: "", _type: "string" },
      commentCount: { _selector: ".count a", _attribute: "", _type: "string" },
    }) as unknown as InterestTopic[];

    const nodesRaw = getDataFromHtml(body, {
      _selector: ".topics .hotlink a",
      _type: "array",
      _item: "object",
      _attribute: "",
      title: { _selector: "", _attribute: "", _type: "string" },
      link: { _selector: "", _attribute: "href", _type: "string" },
    }) as unknown as { title: string; link: string }[];

    const nodes: InterestNode[] = nodesRaw.map((n) => ({
      ...n,
      slug: n.link?.replace("/node/", "").replace("/u/", "") || "",
    }));
    return { topics, nodes };
  });
}

export interface DiscoveryData {
  hotTopics: HotTopic[];
  hotNodes: HotNodes[];
  interestTopics: InterestTopic[];
  interestNodes: InterestNode[];
}

export const getDiscoveryData: CacheAPIFunc<void, DiscoveryData> = async (
  _params?,
  options?,
) => {
  const [hotTopics, hotNodes, interestData] = await Promise.all([
    getHotTopics(),
    getHotNodesOriginal(),
    getInterestTopics({ page: 1 }),
  ]);
  const result = {
    hotTopics,
    hotNodes,
    interestTopics: interestData.topics,
    interestNodes: interestData.nodes,
  };

  if (options?.onRefresh) {
    Promise.all([
      getHotTopics(),
      getHotNodesOriginal(),
      getInterestTopics({ page: 1 }),
    ]).then(([ht, hn, id]) => {
      options.onRefresh!({
        hotTopics: ht,
        hotNodes: hn,
        interestTopics: id.topics,
        interestNodes: id.nodes,
      });
    }).catch(() => {});
  }

  return result;
}
