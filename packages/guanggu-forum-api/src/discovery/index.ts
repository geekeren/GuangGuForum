import { LoginRequiredError, request } from "../client";
import { getDataFromHtml } from "../utils/getDataFromHtml";
import { HotNodes, getHotNodes as getHotNodesOriginal } from "../node/getHotNodes";
import { CacheAPIFunc } from "../types";
import { parseTopicSummaries } from "../getRecentTopics";
import { parseListAuthor } from "../utils/displayName";

export interface HotTopic {
  username: string;
  displayName?: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  topicLink: string;
  category?: string;
  commentCount?: string;
}

export interface InterestTopic {
  username: string;
  displayName?: string;
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
  return request("/", { cache: true, cacheApi: "getHotTopics" }).then(({ body }) => {
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

    const summaries = parseTopicSummaries(body);
    const cells = body.querySelectorAll('.hot-topics .cell');
    return topics.map((t, index) => {
      const summary = summaries.find(item => item.link.split(/[?#]/)[0] === t.topicLink.split(/[?#]/)[0]);
      const author = parseListAuthor(cells[index], t.userLink?.replace('/u/', '') || '', t.userLink);
      const sameAccount = summary && ((!!author.userLink && summary.userLink === author.userLink)
        || (!!author.username && summary.username === author.username));
      return {
        ...t,
        ...author,
        ...(sameAccount && author.displayName === author.username
          ? { displayName: summary.displayName || author.displayName } : {}),
        ...(summary ? { category: summary.category, commentCount: summary.commentCount } : {}),
      };
    });
  });
}

export async function getHotTopicMetadata(topicLink: string): Promise<{ category: string; commentCount?: string }> {
  const tid = topicLink.match(/^\/t\/(\d+)(?:[?#].*)?$/)?.[1];
  if (!tid) throw new Error("热议链接无效");
  const { body } = await request(`/t/${tid}`, { cache: true, cacheApi: "getHotTopicMetadata", timeout: 15000 });
  const category = body?.querySelector('.topic-detail .meta .node')?.textContent.trim();
  if (!category) throw new Error("板块信息暂不可用");
  const summary = body?.querySelector('.topic-reply .ui-header')?.textContent || "";
  const commentCount = summary.match(/共收到\s*([\d,]+)\s*(?:条|个)?\s*回复/)?.[1];
  return { category, commentCount };
}

export async function getHotTopicCategory(topicLink: string): Promise<string> {
  return (await getHotTopicMetadata(topicLink)).category;
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
    cacheApi: "getInterestTopics",
    // Discovery is browseable without authentication; don't redirect its whole page.
    notifyLoginRequired: false,
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
    const topicItems = body.querySelectorAll('.topics .topic-item');
    return {
      topics: topics.map((topic, index) => ({
        ...topic,
        ...parseListAuthor(topicItems[index].querySelector('.meta'), topic.username, topic.userLink),
      })),
      nodes,
    };
  });
}

export interface DiscoveryData {
  hotTopics: HotTopic[];
  hotNodes: HotNodes[];
  interestTopics: InterestTopic[];
  interestNodes: InterestNode[];
  interestLoginRequired?: boolean;
  interestError?: boolean;
}

const loadDiscoveryInterest = () => getInterestTopics({ page: 1 }).catch(error => ({
  topics: [] as InterestTopic[],
  nodes: [] as InterestNode[],
  interestLoginRequired: error instanceof LoginRequiredError,
  interestError: !(error instanceof LoginRequiredError),
}));

export const getDiscoveryData: CacheAPIFunc<void, DiscoveryData> = async (
  _params?,
  options?,
) => {
  const [hotTopics, hotNodes, interestData] = await Promise.all([
    getHotTopics(),
    getHotNodesOriginal(),
    loadDiscoveryInterest(),
  ]);
  const result = {
    hotTopics,
    hotNodes,
    interestTopics: interestData.topics,
    interestNodes: interestData.nodes,
    interestLoginRequired: "interestLoginRequired" in interestData && interestData.interestLoginRequired,
    interestError: "interestError" in interestData && interestData.interestError,
  };

  if (options?.onRefresh) {
    Promise.all([
      getHotTopics(),
      getHotNodesOriginal(),
      loadDiscoveryInterest(),
    ]).then(([ht, hn, id]) => {
      options.onRefresh!({
        hotTopics: ht,
        hotNodes: hn,
        interestTopics: id.topics,
        interestNodes: id.nodes,
        interestLoginRequired: "interestLoginRequired" in id && id.interestLoginRequired,
        interestError: "interestError" in id && id.interestError,
      });
    }).catch(() => {});
  }

  return result;
}
