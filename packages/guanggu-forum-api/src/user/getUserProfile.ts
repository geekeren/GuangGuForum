import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { getUrl } from "../utils/urls";
import { URLS } from "../urls";
import { CacheAPIFunc } from "../types";

export interface UserTopicSummary {
  username: string;
  category: string;
  lastUpdated: string;
  userLink: string;
  userAvatarUrl: string;
  title: string;
  link: string;
  commentCount: string;
}

export interface UserReply {
  replyTitle: string;
  topicTitle: string;
  topicLink: string;
  content: string;
}

export interface UserProfile {
  username: string;
  avatarUrl: string;
  website: string;
  memberNumber: string;
  joinDate: string;
  id: string;
  nickname: string;
  city: string;
  email: string;
  blog: string;
  topicCount: string;
  replyCount: string;
  favoriteCount: string;
  reputation: string;
  topics: UserTopicSummary[];
  replies: UserReply[];
  moreTopicsLink: string;
  moreRepliesLink: string;
}

interface ProfileDetail {
  label: string;
  value: string;
}

interface UserProfileRaw {
  username: string;
  avatarUrl: string;
  website: string;
  memberNumber: string;
  joinDate: string;
  profileDetails: ProfileDetail[];
  topicCount: string;
  replyCount: string;
  favoriteCount: string;
  reputation: string;
  topics: UserTopicSummary[];
  replies: UserReply[];
  moreTopicsLink: string;
  moreRepliesLink: string;
}

const domStructure: DataDom<UserProfileRaw> = {
  _selector: "",
  _type: "object",
  _attribute: "",
  username: {
    _selector: ".profile .ui-header .username",
    _type: "string",
    _attribute: "",
  },
  avatarUrl: {
    _selector: ".profile .ui-header img.avatar",
    _type: "string",
    _attribute: "src",
  },
  website: {
    _selector: ".profile .ui-header .website a",
    _type: "string",
    _attribute: "href",
  },
  memberNumber: {
    _selector: ".profile .ui-header .user-number .number",
    _type: "string",
    _attribute: "",
  },
  joinDate: {
    _selector: ".profile .ui-header .user-number .since",
    _type: "string",
    _attribute: "",
  },
  profileDetails: {
    _selector: ".profile .ui-content dl",
    _type: "array",
    _item: "object",
    _attribute: "",
    label: {
      _selector: "dt",
      _type: "string",
      _attribute: "",
    },
    value: {
      _selector: "dd",
      _type: "string",
      _attribute: "",
    },
  },
  topicCount: {
    _selector: ".sidebar-right .usercard .status-topic strong",
    _type: "string",
    _attribute: "",
  },
  replyCount: {
    _selector: ".sidebar-right .usercard .status-reply strong",
    _type: "string",
    _attribute: "",
  },
  favoriteCount: {
    _selector: ".sidebar-right .usercard .status-favorite strong",
    _type: "string",
    _attribute: "",
  },
  reputation: {
    _selector: ".sidebar-right .usercard .status-reputation strong",
    _type: "string",
    _attribute: "",
  },
  topics: {
    _selector: ".sidebar-left .topic-lists .topic-item",
    _type: "array",
    _item: "object",
    _attribute: "",
    username: {
      _selector: ".meta .username a",
      _type: "string",
      _attribute: "",
    },
    category: {
      _selector: ".meta .node a",
      _type: "string",
      _attribute: "",
    },
    lastUpdated: {
      _selector: ".meta .last-touched",
      _type: "string",
      _attribute: "",
    },
    userLink: {
      _selector: ".meta .username a",
      _type: "string",
      _attribute: "href",
    },
    userAvatarUrl: {
      _selector: "img.avatar",
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
    commentCount: {
      _selector: ".count a",
      _type: "string",
      _attribute: "",
    },
  },
  replies: {
    _selector: ".sidebar-left .replies-lists .reply-item",
    _type: "array",
    _item: "object",
    _attribute: "",
    replyTitle: {
      _selector: ".main .title",
      _type: "string",
      _attribute: "",
    },
    topicTitle: {
      _selector: ".main .title a",
      _type: "string",
      _attribute: "",
    },
    topicLink: {
      _selector: ".main .title a",
      _type: "string",
      _attribute: "href",
    },
    content: {
      _selector: ".main .content",
      _type: "html",
      _attribute: "",
    },
  },
  moreTopicsLink: {
    _selector: ".sidebar-left .topic-lists .ui-footer a",
    _type: "string",
    _attribute: "href",
  },
  moreRepliesLink: {
    _selector: ".sidebar-left .replies-lists .ui-footer a",
    _type: "string",
    _attribute: "href",
  },
};

function parseProfile(body: any): UserProfile {
  if (!body) {
    return null;
  }
  const raw = getDataFromHtml(body, domStructure) as UserProfileRaw;
  if (!raw.username) {
    return null;
  }

  const details: Record<string, string> = {};
  (raw.profileDetails || []).forEach((item) => {
    details[item.label] = item.value;
  });

  return {
    username: raw.username,
    avatarUrl: raw.avatarUrl,
    website: raw.website,
    memberNumber: raw.memberNumber,
    joinDate: raw.joinDate,
    id: details["ID"] || "",
    nickname: details["昵称"] || "",
    city: details["城市"] || "",
    email: details["Email"] || "",
    blog: details["Blog"] || "",
    topicCount: raw.topicCount,
    replyCount: raw.replyCount,
    favoriteCount: raw.favoriteCount,
    reputation: raw.reputation,
    topics: raw.topics || [],
    replies: raw.replies || [],
    moreTopicsLink: raw.moreTopicsLink,
    moreRepliesLink: raw.moreRepliesLink,
  };
}

export interface GetUserProfileParam {
  username: string;
}

export const getUserProfile: CacheAPIFunc<GetUserProfileParam, UserProfile> = (
  { username },
  options?,
) => {
  const trimmed = username.trim();
  const profileUrl = getUrl(URLS.USER_PROFILE, { username: trimmed });
  const cache = options?.cache ?? true;
  return request(profileUrl, {
    cache,
    onRefresh: options?.onRefresh
      ? (body) => {
          const profile = parseProfile(body);
          if (profile) options.onRefresh!(profile);
        }
      : undefined,
  }).then(({ body }) => {
    const profile = parseProfile(body);
    if (!profile) {
      throw new Error(`[getUserProfile] body is null, username: ${username}`);
    }
    return profile;
  });
}
