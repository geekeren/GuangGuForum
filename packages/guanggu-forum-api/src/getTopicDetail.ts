import { request } from "./client";
import { getUrl } from "./utils/urls";
import { URLS } from "./urls";
import { DataDom, getDataFromHtml } from "./utils/getDataFromHtml";
import { CacheAPIFunc } from "./types";

export interface TopicDetail {
  author: string;
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
    author: string;
    authorAvatarUrl: string;
    content: string;
    floor: string;
    upVoteCount: string;
    upVoteUrl: string;
    replyMetas: string[];
  }[];
  commentTotalCount: string;
  createCommentXSRF: string;
  relatingTopics: {
    authorAvatarUrl: string;
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
    link: {
      _type: "string",
      _attribute: "href",
      _selector: ".hot_topic_title a",
    },
  },
};

function parseTopicDetail(body: any): TopicDetail {
  return getDataFromHtml(body, domStructure) as TopicDetail;
}

export interface GetTopicDetailParam {
  tid: string;
}

export const getTopicDetail: CacheAPIFunc<GetTopicDetailParam, TopicDetail> = (
  { tid },
  options?,
) => {
  const cache = options?.cache ?? true;
  return request(
    getUrl(URLS.TOPIC_DETAIL, { tid }),
    {
      cache,
      onRefresh: options?.onRefresh
        ? (body) => options.onRefresh!(parseTopicDetail(body))
        : undefined,
    },
  ).then(({ body }) => {
    return parseTopicDetail(body);
  });
}
