import { request } from "./client";
import { DataDom, getDataFromHtml } from "./utils/getDataFromHtml";

export interface TopicDetail {
  title: string;
  content: string;
  comments: {
    author: string;
    authorAvatarUrl: string;
    content: string;
  }[]
}

const domStructure: DataDom = {
  _selector: ".container .row",
  _type: 'object',
  _attribute: '',
  title: {
    _selector: ".topic-detail .main h3.title",
    _type: 'string',
    _attribute: '',
  },
  content: {
    _selector: '.topic-detail .ui-content',
    _attribute: '',
    _type: 'html',
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
    content: {
      _type: 'string',
      _attribute: '',
      _selector: '.content',
    }
  }
};

export function getTopicDetail(id: string): Promise<TopicDetail> {
  return request(id).then((element) => {
    return (getDataFromHtml(element, domStructure) as Record<string, any>) as TopicDetail;
  });
}
