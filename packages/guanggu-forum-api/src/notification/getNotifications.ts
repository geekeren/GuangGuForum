import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";
import type { HTMLElement } from "node-html-parser";
import { parseListAuthor } from "../utils/displayName";

export interface Notification {
  username: string;
  displayName?: string;
  userLink: string;
  userAvatarUrl: string;
  topicTitle: string;
  topicLink: string;
  titleHtml: string;
  content: string;
}

const domStructure: DataDom<Omit<Notification, 'displayName'>> = {
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

function parseNotifications(body: HTMLElement | undefined): Notification[] {
  const notifications = getDataFromHtml<Omit<Notification, 'displayName'>>(body, domStructure) as unknown as Notification[];
  const items = body?.querySelectorAll('.notification-item') || [];
  return notifications?.map((notification, index) => ({
    ...notification,
    ...parseListAuthor(items[index]?.querySelector('.title'), notification.username, notification.userLink),
  }));
}

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
    cacheApi: "getNotifications",
    query: {
      p: String(page),
    },
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(parseNotifications(body))
      : undefined,
  }).then(({ body }) => {
    return parseNotifications(body);
  });
};
