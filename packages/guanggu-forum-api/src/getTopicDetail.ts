import { request } from "./client";
import { getDataFromHtml } from "./utils/getDataFromHtml";

export interface TopicDetail {
  author: string;
  authorAvatarUrl: string;
  createTime: string;
  lastReplyTime: string;
  lastReplyUser: string;
  title: string;
  category: string;
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
    replyMetas: string[];
  }[],
  commentTotalCount: string;
  relatingTopics: {
    title: string;
    link: string;
  }[]
}

type DataDomMeta = {
  _selector: string;
  _type: 'object' | 'string' | 'html';
  _attribute: string;
} | {
  _selector: string;
  _type: 'array';
  _item: string;
  _attribute: string;
}

type DataToms<T extends Record<string, any> | string> =
  T extends string ?
    DataDomMeta
    :
    DataDomMeta & {
    -readonly [P in keyof T]: T[P] extends (infer E)[] ? DataToms<E>: DataToms<T[P]>;
  }

const domStructure: DataToms<TopicDetail> = {
  _selector: ".container .row",
  _type: 'object',
  _attribute: '',
  title: {
    _selector: ".topic-detail .main h3.title",
    _type: 'string',
    _attribute: '',
  },
  author: {
    _selector: ".topic-detail .main .meta .username",
    _type: 'string',
    _attribute: '',
  },
  authorAvatarUrl: {
    _selector: ".topic-detail .ui-header .avatar",
    _type: 'string',
    _attribute: 'src',
  },
  createTime: {
    _selector: ".topic-detail .main .meta .created-time",
    _type: 'string',
    _attribute: '',
  },
  lastReplyTime: {
    _selector: ".topic-detail .main .meta .last-reply-time",
    _type: 'string',
    _attribute: '',
  },
  lastReplyUser: {
    _selector: ".topic-detail .main .meta .last-reply-username",
    _type: 'string',
    _attribute: '',
  },
  viewCount: {
    _selector: ".topic-detail .ui-footer .hits",
    _type: 'string',
    _attribute: '',
  },
  upVoteCount: {
    _selector: ".topic-detail .ui-footer .up_vote",
    _type: 'string',
    _attribute: '',
  },
  favoriteCount: {
    _selector: '.topic-detail .ui-footer .favorited',
    _type: 'string',
    _attribute: '',
  },
  content: {
    _selector: '.topic-detail .ui-content',
    _attribute: '',
    _type: 'html',
  },
  category: {
    _type: 'string',
    _attribute: '',
    _selector: '.meta .node',
  },
  commentTotalCount: {
    _type: 'string',
    _attribute: '',
    _selector: '.topic-reply .ui-header',
  },
  comments: {
    _selector: '.topic-reply .reply-item',
    _type: 'array',
    _item: 'object',
    _attribute: '',
    authorAvatarUrl: {
      _type: 'string',
      _attribute: 'src',
      _selector: 'a img',
    },
    author: {
      _type: 'string',
      _attribute: '',
      _selector: '.meta .reply-username .username',
    },
    replyMetas: {
      _type: 'array',
      _item: 'string',
      _attribute: '',
      _selector: '.meta .time',
    },
    floor: {
      _type: 'string',
      _attribute: '',
      _selector: '.meta .floor',
    },
    upVoteCount: {
      _type: 'string',
      _attribute: '',
      _selector: '.meta .reply-to .J_replyVote',
    },
    content: {
      _type: 'string',
      _attribute: '',
      _selector: '.content',
    },
  },
  relatingTopics: {
    _selector: '.hot-topics .cell .ui-content',
    _type: 'array',
    _item: 'object',
    _attribute: '',
    title: {
      _type: 'string',
      _attribute: '',
      _selector: '.hot_topic_title',
    },
    link: {
      _type: 'string',
      _attribute: 'href',
      _selector: '.hot_topic_title a',
    }
  }
};

export function getTopicDetail(id: string): Promise<TopicDetail> {
  return request(id).then((element) => {
    return (getDataFromHtml(element, domStructure) as Record<string, any>) as TopicDetail;
  });
}
