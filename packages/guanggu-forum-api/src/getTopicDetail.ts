import type { HTMLElement } from "node-html-parser";
import { request } from "./client";
import { getUrl } from "./utils/urls";
import { URLS } from "./urls";
import { DataDom, getDataFromHtml } from "./utils/getDataFromHtml";
import { CacheAPIFunc } from "./types";

export type CreateCommentStatus = 'ready' | 'form-unavailable' | 'invalid-form' | 'login-required';

export interface TopicDetail {
  tid?: string;
  author: string;
  authorLevel?: string;
  /** Account handle (legacy `.username` / display anchor `data-username`). */
  authorUsername?: string;
  /** Numeric account id from display anchor `data-gzk-mention-user`. */
  authorUserId?: string;
  authorAvatarUrl: string;
  createTime: string;
  lastReplyTime: string;
  lastReplyUser: string;
  title: string;
  category: string;
  categoryLink: string;
  content: string;
  viewCount: string;
  upVoteCount: string;
  favoriteCount: string;
  comments: {
    id?: string;
    author: string;
    authorLevel?: string;
    authorUsername?: string;
    authorUserId?: string;
    authorAvatarUrl: string;
    content: string;
    floor: string;
    upVoteCount: string;
    upVoteUrl: string;
    replyMetas: string[];
  }[];
  commentTotalCount: string;
  createCommentXSRF: string;
  /** Only a verified, enabled reply form is ready. Absence does not imply a posting restriction. */
  createCommentStatus?: CreateCommentStatus;
  relatingTopics: {
    authorAvatarUrl: string;
    authorLink?: string;
    title: string;
    link: string;
  }[];
}

const domStructure: DataDom<TopicDetail> = {
  _selector: ".container .row",
  _type: "object",
  _attribute: "",
  title: {
    _selector: ".topic-detail .main h3.title",
    _type: "string",
    _attribute: "",
  },
  author: {
    _selector: ".topic-detail .main .meta .username",
    _type: "string",
    _attribute: "",
  },
  authorAvatarUrl: {
    _selector: ".topic-detail .ui-header .avatar",
    _type: "string",
    _attribute: "src",
  },
  createTime: {
    _selector: ".topic-detail .main .meta .created-time",
    _type: "string",
    _attribute: "",
  },
  lastReplyTime: {
    _selector: ".topic-detail .main .meta .last-reply-time",
    _type: "string",
    _attribute: "",
  },
  lastReplyUser: {
    _selector: ".topic-detail .main .meta .last-reply-username",
    _type: "string",
    _attribute: "",
  },
  viewCount: {
    _selector: ".topic-detail .ui-footer .hits",
    _type: "string",
    _attribute: "",
  },
  upVoteCount: {
    _selector: ".topic-detail .ui-footer .up_vote",
    _type: "string",
    _attribute: "",
  },
  favoriteCount: {
    _selector: ".topic-detail .ui-footer .favorited",
    _type: "string",
    _attribute: "",
  },
  content: {
    _selector: ".topic-detail .ui-content",
    _attribute: "",
    _type: "html",
  },
  category: {
    _type: "string",
    _attribute: "",
    _selector: ".meta .node",
  },
  categoryLink: {
    _type: "string",
    _attribute: "href",
    _selector: ".meta .node a",
  },
  commentTotalCount: {
    _type: "string",
    _attribute: "",
    _selector: ".topic-reply .ui-header",
  },
  createCommentXSRF: {
    _type: "string",
    _attribute: "value",
    _selector: '.topic-reply-create form input[name="_xsrf"]',
  },
  comments: {
    _selector: ".topic-reply .reply-item",
    _type: "array",
    _item: "object",
    _attribute: "",
    id: {
      _type: "string",
      _attribute: "id",
      _selector: "",
    },
    authorAvatarUrl: {
      _type: "string",
      _attribute: "src",
      _selector: "a img",
    },
    author: {
      _type: "string",
      _attribute: "",
      _selector: ".meta .reply-username .username",
    },
    replyMetas: {
      _type: "array",
      _item: "string",
      _attribute: "",
      _selector: ".meta .time",
    },
    floor: {
      _type: "string",
      _attribute: "",
      _selector: ".meta .floor",
    },
    upVoteCount: {
      _type: "string",
      _attribute: "",
      _selector: ".meta .reply-to .J_replyVote",
    },
    upVoteUrl: {
      _type: "string",
      _attribute: "href",
      _selector: ".meta .reply-to .J_replyVote",
    },
    content: {
      _type: "html",
      _attribute: "",
      _selector: ".content",
    },
  },
  relatingTopics: {
    _selector: ".hot-topics .cell .ui-content",
    _type: "array",
    _item: "object",
    _attribute: "",
    title: {
      _type: "string",
      _attribute: "",
      _selector: ".hot_topic_title",
    },
    authorAvatarUrl: {
      _type: "string",
      _attribute: "src",
      _selector: "tr > td:nth-child(1) > a > img",
    },
    authorLink: {
      _type: "string",
      _attribute: "href",
      _selector: "tr > td:nth-child(1) > a",
    },
    link: {
      _type: "string",
      _attribute: "href",
      _selector: ".hot_topic_title a",
    },
  },
};

interface ParsedAuthor {
  author: string;
  authorLevel?: string;
  authorUsername?: string;
  authorUserId?: string;
  authorAvatarUrl?: string;
}

const LEVEL_TEXT = /^Lv\.?\s*\d+$/i;

function nodeClasses(node: HTMLElement): string[] {
  return String(node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

/**
 * Account anchors and username wrappers are never level nodes. The display-name
 * anchor in particular carries no level data; its attributes/title must not be
 * mined for one. Plain siblings (including `a[href="/level"]`) still work.
 */
function isAccountNode(node: HTMLElement): boolean {
  if (!node || node.nodeType !== 1) return false;
  const classes = nodeClasses(node);
  if (["username", "reply-username", "gzk-display-name", "gzk-legacy-id"].some((name) => classes.includes(name))) {
    return true;
  }
  return node.tagName === "A" && !!node.getAttribute("href")?.startsWith("/u/");
}

function findLegacyAnchor(container: HTMLElement | null | undefined): HTMLElement | undefined {
  if (!container) return undefined;
  const username = container.querySelector(".username") || undefined;
  const scoped = username?.tagName === "A" && username.getAttribute("href")?.startsWith("/u/")
    ? username
    : username?.querySelector('a[href^="/u/"]') || undefined;
  if (scoped) return scoped;
  if (container.tagName === "A" && container.getAttribute("href")?.startsWith("/u/")
    && !nodeClasses(container).includes("gzk-display-name")) {
    return container;
  }
  return container.querySelector('a[href^="/u/"]:not(.gzk-display-name)') || undefined;
}

function findLevelAbove(anchor: HTMLElement | undefined, root: HTMLElement | null | undefined): string | undefined {
  let current: any = anchor;
  while (current && current !== root && current.parentNode) {
    const parent = current.parentNode;
    const level = parent.childNodes
      .filter((child: any) => child !== current)
      .filter((child: any) => !isAccountNode(child))
      .map((child: any) => child.textContent?.trim() || "")
      .find((text: string) => LEVEL_TEXT.test(text));
    if (level) return level;
    current = parent;
  }
  return undefined;
}

function parseAuthor(container: HTMLElement | null | undefined, fallback: string): ParsedAuthor {
  const display = container?.querySelector(".gzk-display-name") || undefined;
  const legacy = findLegacyAnchor(container);
  const legacyText = legacy?.textContent.trim()
    || container?.querySelector(".username")?.textContent.trim()
    || "";
  const displayText = display
    ? display.querySelector("bdi")?.textContent.trim() || display.textContent.trim()
    : "";
  // Upstream order: rendered nickname, `data-display-name`, then the legacy handle.
  const displayName = display
    ? displayText || display.getAttribute("data-display-name")?.trim() || legacyText
    : "";
  const author = (display ? displayName : legacy?.textContent.trim()) || fallback;
  const result: ParsedAuthor = { author };

  const level = findLevelAbove(display, container) || findLevelAbove(legacy, container);
  if (level) result.authorLevel = level;

  const username = display?.getAttribute("data-username")?.trim() || legacyText;
  if (username) result.authorUsername = username;

  const userId = display?.getAttribute("data-gzk-mention-user")?.trim();
  if (userId && /^\d+$/.test(userId)) result.authorUserId = userId;

  const avatar = display?.getAttribute("data-avatar")?.trim();
  if (avatar) result.authorAvatarUrl = avatar;

  return result;
}

function isRenderedContent(node: HTMLElement, boundary: HTMLElement, allowReplyFormLayout = false): boolean {
  // The verified server layout is region > DIV.ui-content > FORM, not rendered topic HTML.
  const serverLayout = allowReplyFormLayout && node.tagName === 'FORM'
    && node.parentNode?.tagName === 'DIV' && node.parentNode.parentNode === boundary
    ? node.parentNode : null;
  let current: HTMLElement | null = node;
  while (current && current !== boundary) {
    if (nodeClasses(current).some(name => {
      if (name === 'topic-reply-create') return current !== node || allowReplyFormLayout;
      if (name === 'ui-content') return current !== serverLayout;
      return ['topic-detail', 'topic-reply', 'reply-item', 'content'].includes(name);
    })) return true;
    current = current.parentNode as HTMLElement | null;
  }
  return current !== boundary;
}

function parseReplyForm(body: HTMLElement | undefined, tid: string): Pick<TopicDetail, 'createCommentXSRF' | 'createCommentStatus'> {
  const unavailable = { createCommentXSRF: '', createCommentStatus: 'form-unavailable' as const };
  const invalid = { createCommentXSRF: '', createCommentStatus: 'invalid-form' as const };
  const root = body?.querySelector('.container .row');
  if (!root) return unavailable;
  // Keep the page-layout boundary: a topic or reply may render user-supplied HTML.
  const regions = root.querySelectorAll('.topic-reply-create').filter(region => !isRenderedContent(region, root));
  if (!regions.length) return unavailable;
  if (regions.length !== 1) return invalid;
  const region = regions[0];
  const forms = region.querySelectorAll('form').filter(form => !isRenderedContent(form, region, true));
  const login = forms.some(form => form.getAttribute('action') === '/login'
    && form.querySelectorAll('input[name="password"][type="password"]').length === 1);
  const replyForms = forms.filter(form => form.querySelector('textarea[name="content"]'));
  if (!replyForms.length) return login ? { createCommentXSRF: '', createCommentStatus: 'login-required' } : unavailable;
  if (replyForms.length !== 1 || forms.length !== 1) return invalid;
  const form = replyForms[0];
  const action = form.getAttribute('action');
  if (form.getAttribute('method')?.toLowerCase() !== 'post' || (action !== '' && action !== `/t/${tid}`)
    || form.hasAttribute('disabled') || form.querySelector('fieldset[disabled]')) return invalid;
  const content = form.querySelectorAll('[name="content"]');
  const tokens = form.querySelectorAll('[name="_xsrf"]');
  const topicIds = form.querySelectorAll('[name="tid"]');
  if (content.length !== 1 || content[0].tagName !== 'TEXTAREA' || content[0].hasAttribute('disabled')
    || content[0].hasAttribute('readonly') || tokens.length !== 1 || tokens[0].tagName !== 'INPUT'
    || tokens[0].getAttribute('type')?.toLowerCase() !== 'hidden' || tokens[0].hasAttribute('disabled')
    || topicIds.length > 1) return invalid;
  // Older form fixtures lack tid; when the server provides it, it must identify this topic.
  if (topicIds.length && (topicIds[0].tagName !== 'INPUT' || topicIds[0].getAttribute('type')?.toLowerCase() !== 'hidden'
    || topicIds[0].hasAttribute('disabled') || topicIds[0].getAttribute('value') !== tid)) return invalid;
  const token = tokens[0].getAttribute('value') || '';
  if (!token.trim()) return invalid;
  return { createCommentXSRF: token, createCommentStatus: 'ready' };
}

function parseTopicDetail(body: HTMLElement | undefined, tid: string): TopicDetail {
  const detail = getDataFromHtml<TopicDetail>(body, domStructure);
  if (!detail) return detail;
  detail.tid = tid;
  Object.assign(detail, parseReplyForm(body, tid));
  const root = body?.querySelector(".container .row");
  const topicMeta = root?.querySelector(".topic-detail .main .meta");
  Object.assign(detail, parseAuthor(topicMeta, detail.author));
  // The same meta can render the last-reply author with display-name markup.
  detail.lastReplyUser = parseAuthor(
    topicMeta?.querySelector(".last-reply-username"),
    detail.lastReplyUser,
  ).author;
  const replies = root?.querySelectorAll(".topic-reply .reply-item") || [];
  detail.comments.forEach((comment, index) => {
    Object.assign(comment, parseAuthor(replies[index]?.querySelector(".meta"), comment.author));
  });
  return detail;
}

export interface GetTopicDetailParam {
  tid: string;
  page?: string;
  replyId?: string;
  latest?: boolean;
}

function parseTopicResponse(response: Awaited<ReturnType<typeof request>>, tid: string): TopicDetail {
  if (!response.fromCache && response.rawRes?.statusCode !== 200) throw new Error('帖子加载失败，请重试');
  if (!response.body?.querySelector('.container .row .topic-detail')) throw new Error('帖子加载失败，请重试');
  const detail = parseTopicDetail(response.body, tid);
  if (!detail?.title) throw new Error('帖子加载失败，请重试');
  return detail;
}

function getLastCommentPage(body: HTMLElement | undefined, tid: string): string | undefined {
  let lastPage = 1;
  for (const link of body?.querySelectorAll('.pagination a[href]') || []) {
    const href = link.getAttribute('href') || '';
    const path = href.replace(/^https?:\/\/www\.guozaoke\.com(?=\/)/i, '');
    const [pathname, query] = path.split('?');
    if (pathname && pathname !== `/t/${tid}`) continue;
    const value = query?.split('#')[0].split('&').find(pair => pair.startsWith('p='))?.slice(2);
    const candidate = value && /^[1-9]\d*$/.test(value) ? Number(value) : 0;
    if (Number.isSafeInteger(candidate)) lastPage = Math.max(lastPage, candidate);
  }
  return lastPage > 1 ? String(lastPage) : undefined;
}

export const getTopicDetail: CacheAPIFunc<GetTopicDetailParam, TopicDetail> = (
  { tid, page, replyId, latest },
  options?,
) => {
  if (latest) {
    // Start at the canonical topic, not a historical reply resolver or cached page.
    const topicUrl = getUrl(URLS.TOPIC_DETAIL, { tid });
    return request(topicUrl, { cache: false, cacheApi: 'getTopicDetail', query: {} })
      .then(async (response) => {
        parseTopicResponse(response, tid);
        const lastPage = getLastCommentPage(response.body, tid);
        if (lastPage) {
          response = await request(topicUrl, {
            cache: false, cacheApi: 'getTopicDetail', query: { p: lastPage },
          });
        }
        return parseTopicResponse(response, tid);
      });
  }
  const cache = options?.cache ?? true;
  return request(
    replyId && /^\d+$/.test(replyId)
      ? `/search/reply/${replyId}`
      : getUrl(URLS.TOPIC_DETAIL, { tid }),
    {
      cache,
      cacheApi: "getTopicDetail",
      query: page && /^\d+$/.test(page) && !replyId ? { p: page } : {},
      onRefresh: options?.onRefresh
        ? (body) => options.onRefresh!(parseTopicDetail(body, tid))
        : undefined,
    },
  ).then((response) => parseTopicResponse(response, tid));
}
