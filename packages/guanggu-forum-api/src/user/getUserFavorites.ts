import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";
import type { HTMLElement } from "node-html-parser";
import { getDisplayName } from "../utils/displayName";

export interface FavoriteTopic {
  username: string;
  displayName?: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  link: string;
  category: string;
  lastUpdated: string;
  lastReplyUsername: string;
  commentCount: string;
}

const domStructure: DataDom<Omit<FavoriteTopic, 'displayName'>> = {
  _selector: ".topic-item",
  _type: "array",
  _item: "object",
  _attribute: "",
  username: {
    _selector: ".username a",
    _type: "string",
    _attribute: "",
  },
  userLink: {
    _selector: ".username a",
    _type: "string",
    _attribute: "href",
  },
  userAvatarUrl: {
    _selector: "a img.avatar",
    _type: "string",
    _attribute: "src",
  },
  title: {
    _selector: ".main .title a",
    _type: "string",
    _attribute: "",
  },
  link: {
    _selector: ".main .title a",
    _type: "string",
    _attribute: "href",
  },
  category: {
    _selector: ".node a",
    _type: "string",
    _attribute: "",
  },
  lastUpdated: {
    _selector: ".last-touched",
    _type: "string",
    _attribute: "",
  },
  lastReplyUsername: {
    _selector: ".last-reply-username a strong",
    _type: "string",
    _attribute: "",
  },
  commentCount: {
    _selector: ".count a",
    _type: "string",
    _attribute: "",
  },
};

function parseFavoriteTopics(body: HTMLElement | undefined): FavoriteTopic[] {
  const topics = getDataFromHtml<Omit<FavoriteTopic, 'displayName'>>(body, domStructure) as unknown as FavoriteTopic[];
  const items = body?.querySelectorAll('.topic-item') || [];
  return topics?.map((topic, index) => ({
    ...topic,
    displayName: getDisplayName(items[index]?.querySelector('.meta') || items[index], topic.username, topic.userLink),
  }));
}

export interface GetUserFavoritesParam {
  username: string;
  page?: number;
}

export const getUserFavorites: CacheAPIFunc<GetUserFavoritesParam, FavoriteTopic[]> = (
  param,
  options?,
) => {
  const { username, page = 1 } = param;
  const cache = options?.cache ?? true;

  return request(`/u/${username}/favorites`, {
    cache,
    cacheApi: "getUserFavorites",
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(parseFavoriteTopics(body))
      : undefined,
  }).then(({ body }) => {
    return parseFavoriteTopics(body);
  });
};
