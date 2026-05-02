import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";

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

export function getUserFavorites(
  param: GetUserFavoritesParam,
): Promise<FavoriteTopic[]> {
  const { username, page = 1 } = param;

  return request(`/u/${username}/favorites`, {
    query: {
      p: String(page),
    },
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as unknown as FavoriteTopic[];
  });
}
