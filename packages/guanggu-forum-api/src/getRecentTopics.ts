import { request } from "./client";
import { DataDom, getDataFromHtml } from "./utils/getDataFromHtml";

export interface TopicSummary {
  username: string;
  category: string;
  lastUpdated: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  link: string;
  commentCount: string;
}

const domStructure: DataDom = {
  _selector: ".topics",
  _type: 'object',
  _attribute: '',
  topics: {
    _attribute: '',
    _type: 'array',
    _item: 'object',
    _selector: ".topic-item",
    category: {
      _selector: ".meta .node a",
      _attribute: "",
      _type: 'string',
    },
    lastUpdated: {
      _selector: ".meta .last-touched",
      _attribute: "",
      _type: 'string',
    },
    commentCount: {
      _selector: ".count",
      _attribute: "",
      _type: 'string',
    },
    username: {
      _selector: ".meta .username a",
      _attribute: "",
      _type: 'string',
    },
    userLink: {
      _selector: "a",
      _attribute: "href",
      _type: 'string',
    },
    userAvatarUrl: {
      _selector: "a img",
      _attribute: "src",
      _type: 'string',
    },
    title: {
      _selector: ".main .title a",
      _attribute: '',
      _type: 'string',
    },
    link: {
      _selector: ".main .title a",
      _attribute: "href",
      _type: 'string',
    }
  }
};

export interface GetTopicsParam {
  type: 'default' | 'latest' | 'elite',
  page: number,
}

export function getRecentTopics(param: GetTopicsParam): Promise<TopicSummary[]> {
  const { type = 'default', page = 1 } = param;

  const tabUrlValue = {
    default: undefined,
    latest: 'latest',
    elite: 'elite',
  }

  return request('/', {
    p: String(page),
    tab: tabUrlValue[type]
  }).then((element) => {
    return (getDataFromHtml(element, domStructure) as Record<string, any>)
      .topics as TopicSummary[];
  });
}
