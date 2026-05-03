import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";

export interface FavoriteTopic {
  username: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  link: string;
  category: string;
  lastUpdated: string;
  lastReplyUsername: string;
  commentCount: string;
}

const domStructure: DataDom<FavoriteTopic> = {
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
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(getDataFromHtml(body, domStructure) as unknown as FavoriteTopic[])
      : undefined,
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as unknown as FavoriteTopic[];
  });
};
