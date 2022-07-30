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
  type: 'default' | 'latestPublish' | 'elite'
}

export function getRecentTopics(param: GetTopicsParam): Promise<TopicSummary[]> {
  const { type = 'default' } = param;

  const relativeUrl: Record<GetTopicsParam['type'], string> = {
    default: '/',
    latestPublish: '/?tab=latest',
    elite: '/?tab=elite',
  }
  return request(relativeUrl[type]).then((element) => {
    return (getDataFromHtml(element, domStructure) as Record<string, any>)
      .topics as TopicSummary[];
  });
}
