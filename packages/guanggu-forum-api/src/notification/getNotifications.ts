import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";

export interface Notification {
  username: string;
  userLink: string;
  userAvatarUrl: string;
  topicTitle: string;
  topicLink: string;
  titleHtml: string;
  content: string;
}

const domStructure: DataDom<Notification> = {
  _selector: ".notification-item",
  _type: "array",
  _item: "object",
  _attribute: "",
  username: {
    _selector: ".title a:first-of-type",
    _type: "string",
    _attribute: "",
  },
  userLink: {
    _selector: ".title a:first-of-type",
    _type: "string",
    _attribute: "href",
  },
  userAvatarUrl: {
    _selector: "a img.avatar",
    _type: "string",
    _attribute: "src",
  },
  topicTitle: {
    _selector: ".title a:last-of-type",
    _type: "string",
    _attribute: "",
  },
  topicLink: {
    _selector: ".title a:last-of-type",
    _type: "string",
    _attribute: "href",
  },
  titleHtml: {
    _selector: ".title",
    _type: "html",
    _attribute: "",
  },
  content: {
    _selector: ".content",
    _type: "html",
    _attribute: "",
  },
};

export interface GetNotificationsParam {
  page?: number;
}

export const getNotifications: CacheAPIFunc<GetNotificationsParam, Notification[]> = (
  param = {},
  options?,
) => {
  const { page = 1 } = param;
  const cache = options?.cache ?? true;

  return request("/notifications", {
    cache,
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(getDataFromHtml(body, domStructure) as Notification[])
      : undefined,
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as Notification[];
  });
};
