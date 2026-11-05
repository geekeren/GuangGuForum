import { HTMLElement } from "node-html-parser";
import { request } from "./client";
import { DataDom, getDataFromHtml } from "./utils/getDataFromHtml";
import { CacheAPIFunc } from "./types";
import { parseListAuthor } from "./utils/displayName";

export interface TopicSummary {
  username: string;
  /** Presentation label; account identity remains in the existing fields. */
  displayName?: string;
  category: string;
  lastUpdated: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  link: string;
  commentCount: string;
  isPinned?: boolean;
}

export const domStructure: DataDom<Omit<TopicSummary, "isPinned" | "displayName">> = {
  _attribute: "",
  _type: "array",
  _item: "object",
  _selector: ".topics .topic-item",
  category: {
    _selector: ".meta .node a",
    _attribute: "",
    _type: "string",
  },
  lastUpdated: {
    _selector: ".meta .last-touched",
    _attribute: "",
    _type: "string",
  },
  commentCount: {
    _selector: ".count",
    _attribute: "",
    _type: "string",
  },
  username: {
    _selector: ".meta .username a",
    _attribute: "",
    _type: "string",
  },
  userLink: {
    _selector: "a",
    _attribute: "href",
    _type: "string",
  },
  userAvatarUrl: {
    _selector: "a img.avatar",
    _attribute: "src",
    _type: "string",
  },
  title: {
    _selector: ".main .title a",
    _attribute: "",
    _type: "string",
  },
  link: {
    _selector: ".main .title a",
    _attribute: "href",
    _type: "string",
  },
};

export function parseTopicSummaries(body?: HTMLElement): TopicSummary[] {
  if (!body) return [];
  const items = body.querySelectorAll(".topics .topic-item");
  const topics = getDataFromHtml<Omit<TopicSummary, 'isPinned' | 'displayName'>>(body, domStructure) as unknown as TopicSummary[];
  return topics.map((topic, index) => ({
    ...topic,
    ...parseListAuthor(items[index].querySelector('.meta'), topic.username, topic.userLink),
    isPinned: !!items[index].querySelector(".title .icon-pushpin"),
  }));
}

export interface GetTopicsParam {
  type: "default" | "latest" | "elite" | "follows" | "interest";
  page: number;
}

export const getRecentTopics: CacheAPIFunc<GetTopicsParam, TopicSummary[]> = (
  param,
  options?,
) => {
  const { type = "default", page = 1 } = param;
  const cache = options?.cache ?? true;

  const tabUrlValue = {
    default: undefined,
    latest: "latest",
    elite: "elite",
    follows: "follows",
    interest: "interest",
  };

  return request("/", {
    cache,
    cacheApi: "getRecentTopics",
    query: {
      p: String(page),
      tab: tabUrlValue[type],
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(parseTopicSummaries(body))
      : undefined,
  }).then(({ body }) => {
    return parseTopicSummaries(body);
  });
};
