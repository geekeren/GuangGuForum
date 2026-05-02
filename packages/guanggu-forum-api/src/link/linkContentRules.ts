/**
 * 站点内容选择器配置
 * 匹配 URL 后用 selector 定位正文根节点，跳过导航/广告/侧栏等无关内容
 */
export interface LinkContentRule {
  pattern: RegExp;
  selector: string;
}

const LINK_CONTENT_RULES: LinkContentRule[] = [
  // 微信公众号
  { pattern: /mp\.weixin\.qq\.com/, selector: "#js_content" },

  // 知乎专栏
  { pattern: /zhuanlan\.zhihu\.com/, selector: ".Post-RichTextContainer" },

  // 知乎问答
  { pattern: /www\.zhihu\.com\/question/, selector: ".QuestionAnswers-answers" },

  // 少数派
  { pattern: /sspai\.com/, selector: ".article-body" },

  // 掘金
  { pattern: /juejin\.cn\/post/, selector: ".article-content" },

  // 语雀
  { pattern: /yuque\.com/, selector: ".yuque-doc-content" },

  // CSDN
  { pattern: /blog\.csdn\.net/, selector: "#article_content" },

  // 简书
  { pattern: /www\.jianshu\.com\/p\//, selector: ".article" },

  // 微博正文
  { pattern: /m\.weibo\.cn\/status/, selector: ".weibo-text" },
  { pattern: /weibo\.com\/\d+\/\w+/, selector: ".WB_editor_iframe" },

  // 腾讯新闻
  { pattern: /new\.qq\.com/, selector: ".content-article" },

  // 网易新闻
  { pattern: /163\.com\/\w+\/article/, selector: ".post_body" },

  // 澎湃新闻
  { pattern: /thepaper\.cn/, selector: ".news_txt" },

  // 36氪
  { pattern: /36kr\.com\/p\//, selector: ".article-content" },

  // 虎嗅
  { pattern: /huxiu\.com\/article/, selector: ".article-content" },

  // 今日头条
  { pattern: /toutiao\.com\/i\d+/, selector: ".article-content" },
  { pattern: /m\.toutiao\.com\/i\d+/, selector: ".article-content" },

  // 百家号
  { pattern: /baijiahao\.baidu\.com/, selector: ".article-content" },

  // 搜狐新闻
  { pattern: /sohu\.com\/a\//, selector: ".article" },

  // 新浪新闻
  { pattern: /sina\.com\.cn/, selector: "#artibody" },

  // 界面新闻
  { pattern: /jiemian\.com/, selector: ".article-content" },

  // 钛媒体
  { pattern: /tmtpost\.com/, selector: ".article-content" },

  // 雪球
  { pattern: /xueqiu\.com\/\d+\/\d+/, selector: ".article-content" },

  // InfoQ
  { pattern: /infoq\.cn\/article/, selector: ".article-content" },

  // 博客园
  { pattern: /cnblogs\.com\/.*\/p\//, selector: "#cnblogs_post_body" },

  // SegmentFault
  { pattern: /segmentfault\.com\/a\//, selector: ".article-content" },

  // V2EX
  { pattern: /v2ex\.com\/t\//, selector: ".topic_content" },

  // GitHub README
  { pattern: /github\.com\/.*\/blob\//, selector: "article" },

  // Bilibili 专栏
  { pattern: /bilibili\.com\/read\//, selector: ".article-content" },
];

export function matchContentRule(url: string): LinkContentRule | null {
  return LINK_CONTENT_RULES.find((r) => r.pattern.test(url)) || null;
}
