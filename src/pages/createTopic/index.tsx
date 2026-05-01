import { View, Text, Textarea, Input, Picker, Radio, RadioGroup, Image, ScrollView, ShareElement } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import { createTopic, NodeGroup, fetchLinkSummary, LinkSummary } from "guanggu-forum-api";
import {
  getCachedNodeNavigation,
  fetchAndCacheNodeNavigation,
} from "../../utils/nodeNavigation";
import { isWhitelistedDomain } from "../../utils/linkHandler";
import Navbar from "../../components/Navbar";
import { BRAND_COLOR } from "../../utils/theme";
import "./index.scss";

const LAST_NODE_KEY = "last_selected_node";

const DEBUG = false;

type TopicType = "normal" | "repost" | "event" | "dating";

const TOPIC_TYPES: { key: TopicType; label: string; node: string | null }[] = [
  { key: "normal", label: "普通", node: null },
  { key: "repost", label: "转载", node: "water" },
  { key: "event", label: "活动", node: "lowshine" },
  { key: "dating", label: "相亲贴", node: "date" },
];

const HIDDEN_NODES = ["water", "lowshine", "date"];

const GENDER_OPTIONS = ["男", "女"];

const DATE_MODE_OPTIONS = ["请选择", "今天", "明天", "后天", "本周末", "下周"];

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CreateTopic() {
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [pickerValue, setPickerValue] = useState<[number, number]>([0, 0]);
  const [tempPickerValue, setTempPickerValue] = useState<[number, number]>([0, 0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [topicType, setTopicType] = useState<TopicType>("normal");

  // 转载专用
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [clipLoading, setClipLoading] = useState(false);
  const [repostPreview, setRepostPreview] = useState<LinkSummary | null>(null);
  // 活动专用
  const [eventTime, setEventTime] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  // 相亲专用
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [requirements, setRequirements] = useState("");

  const contentRef = useRef<any>(null);
  const [bodyHeight, setBodyHeight] = useState("100vh");

  useEffect(() => {
    const sys = Taro.getSystemInfoSync();
    const navH = 44 + (sys.statusBarHeight || 0);
    const safeBottom = sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0;
    const btnAreaH = 28 + 56 + 16 + safeBottom; // margin-top + btn(56rpx≈28px) + margin-bottom + safe
    setBodyHeight(`calc(100vh - ${navH + btnAreaH}px)`);
  }, []);

  const age = birthYear ? String(new Date().getFullYear() - parseInt(birthYear)) : "";

  const currentTypeConfig = TOPIC_TYPES.find((t) => t.key === topicType)!;
  const nodeLocked = topicType !== "normal";

  const filteredGroups = nodeGroups.map((g) => ({
    ...g,
    nodes: g.nodes.filter((n) => !HIDDEN_NODES.includes(n.slug)),
  })).filter((g) => g.nodes.length > 0);

  const lockedNodeName = (() => {
    if (!nodeLocked || !currentTypeConfig.node) return "";
    for (const group of nodeGroups) {
      const found = group.nodes.find((n) => n.slug === currentTypeConfig.node);
      if (found) return found.name;
    }
    return currentTypeConfig.node;
  })();

  const restorePicker = (groups: NodeGroup[], preferNodeSlug?: string) => {
    if (preferNodeSlug) {
      for (let gi = 0; gi < groups.length; gi++) {
        const ni = groups[gi].nodes.findIndex((n) => n.slug === preferNodeSlug);
        if (ni >= 0) {
          setPickerValue([gi, ni]);
          setTempPickerValue([gi, ni]);
          return;
        }
      }
    }
    try {
      const saved = Taro.getStorageSync(LAST_NODE_KEY);
      if (saved) {
        const { groupIndex, nodeIndex } = JSON.parse(saved);
        if (groupIndex < groups.length && nodeIndex < (groups[groupIndex]?.nodes?.length || 0)) {
          setPickerValue([groupIndex, nodeIndex]);
          setTempPickerValue([groupIndex, nodeIndex]);
        }
      }
    } catch {}
  };

  const router = useRouter();
  const nodeSlug = router.params.node;

  useEffect(() => {
    const cached = getCachedNodeNavigation();
    if (cached.length) {
      setNodeGroups(cached);
      restorePicker(cached, nodeSlug);
    }
    fetchAndCacheNodeNavigation().then((groups) => {
      setNodeGroups(groups);
      restorePicker(groups, nodeSlug);
    });
  }, []);

  useEffect(() => {
    if (nodeLocked && currentTypeConfig.node) {
      for (let gi = 0; gi < nodeGroups.length; gi++) {
        const ni = nodeGroups[gi].nodes.findIndex((n) => n.slug === currentTypeConfig.node);
        if (ni >= 0) {
          setPickerValue([gi, ni]);
          setTempPickerValue([gi, ni]);
          return;
        }
      }
    }
  }, [topicType, nodeGroups]);

  const currentGroup = filteredGroups[tempPickerValue[0]];
  const confirmedGroup = filteredGroups[pickerValue[0]];
  const confirmedNode = confirmedGroup?.nodes?.[pickerValue[1]];

  const handleTopicTypeChange = (type: TopicType) => {
    setTopicType(type);
    if (type === "repost" && !sourceUrl) {
      Taro.getClipboardData({
        success: (res) => {
          const text = (res.data || "").trim();
          if (isWhitelistedDomain(text)) {
            setClipLoading(true);
            fetchLinkSummary(text).then((info: LinkSummary) => {
              setClipLoading(false);
              setRepostPreview({ ...info, url: text });
            }).catch(() => {
              setClipLoading(false);
            });
          }
        },
      });
    }
  };

  const confirmRepost = () => {
    const info = repostPreview;
    if (!info) return;
    setSourceUrl(info.url);
    const parts = [info.siteName, info.title].filter(Boolean);
    if (parts.length) setSourceTitle(parts.join(" - "));
    if (info.title) setTitle(info.title);
    if (info.image) setThumbnail(info.image);
    if (info.bodyText || info.description) {
      const fullText = info.bodyText || info.description;
      setSummary(fullText.slice(0, 400));
    }
    setContent("大家怎么看");
    setRepostPreview(null);
    setTimeout(() => {
      contentRef.current?.focus?.();
    }, 100);
  };

  const cancelRepost = () => {
    setRepostPreview(null);
  };

  const handleTitleInput = (e: any) => {
    const val = e.detail.value;
    if (val.includes("\n")) {
      const parts = val.split("\n");
      const newTitle = parts[0];
      const restContent = parts.slice(1).join("\n");
      setTitle(newTitle);
      setContent((prev) => restContent + (prev ? "\n" + prev : ""));
      setTimeout(() => {
        contentRef.current?.focus?.();
      }, 50);
    } else {
      setTitle(val);
    }
  };

  const FROM_MINI = "\n\n---\n*本帖发自[小程序](https://www.guozaoke.com/t/91893)*";

  const buildContent = (): string => {
    switch (topicType) {
      case "repost": {
        const thumbPart = thumbnail ? `![缩略图](${thumbnail})\n\n` : "";
        const linkText = sourceTitle || sourceUrl;
        const summaryPart = summary ? `，摘要：${summary.slice(0, 400)}…` : "";
        return `${thumbPart}> 转载自 [${linkText}](${sourceUrl})${summaryPart}\n\n${content}${FROM_MINI}`;
      }
      case "event": {
        return `- 时间：${eventTime}\n- 地点：${eventLocation}\n\n${content}${FROM_MINI}`;
      }
      case "dating": {
        return `- 性别：${gender}\n- 年龄：${age}\n\n**期望：**\n${requirements}\n\n**自我介绍：**\n${content}${FROM_MINI}`;
      }
      default:
        return `${content}${FROM_MINI}`;
    }
  };

  const handleSubmit = async () => {
    const resolvedNode = nodeLocked ? currentTypeConfig.node : confirmedNode?.slug;
    if (!resolvedNode) {
      Taro.showToast({ title: "请选择板块", icon: "none" });
      return;
    }
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }
    const finalContent = buildContent().trim();
    if (!finalContent) {
      Taro.showToast({ title: "请输入内容", icon: "none" });
      return;
    }
    if (topicType === "repost" && !sourceUrl.trim()) {
      Taro.showToast({ title: "请填写原文链接", icon: "none" });
      return;
    }
    if (topicType === "event" && (!eventTime.trim() || !eventLocation.trim())) {
      Taro.showToast({ title: "请填写活动时间和地点", icon: "none" });
      return;
    }
    if (topicType === "dating" && (!gender.trim() || !age.trim())) {
      Taro.showToast({ title: "请填写基本信息", icon: "none" });
      return;
    }
    if (DEBUG) {
      console.log("=== 生成内容 ===", finalContent);
      Taro.showModal({
        title: "生成内容预览",
        content: finalContent,
        showCancel: false,
      });
      return;
    }
    setSubmitting(true);
    Taro.showLoading({ title: "发布中...", mask: true });
    try {
      await createTopic({
        node: resolvedNode,
        title: title.trim(),
        content: finalContent,
      });
      Taro.hideLoading();
      Taro.eventCenter.trigger("refreshTopics");
      Taro.navigateBack();
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: "发布失败", icon: "none" });
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => {
    switch (topicType) {
      case "repost":
        return (
          <View className="editorSection">
            <View className="fieldGroup">
              <Text className="fieldLabel">原文链接</Text>
              <Input
                className="fieldInput"
                placeholder="粘贴原文链接"
                placeholderClass="fieldPlaceholder"
                cursorColor={BRAND_COLOR}
                value={sourceUrl}
                onInput={(e) => setSourceUrl(e.detail.value)}
              />
            </View>
            <Textarea
              className="titleInput"
              placeholder="标题"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => contentRef.current?.focus?.()}
            />
            {sourceUrl ? (
              <View className="fieldGroup">
                <Text className="fieldLabel">摘要</Text>
                <Textarea
                  className="fieldTextarea"
                  placeholder="文章摘要（可选）..."
                  placeholderClass="fieldPlaceholder"
                  cursorColor={BRAND_COLOR}
                  maxlength={-1}
                  value={summary}
                  onInput={(e) => setSummary(e.detail.value)}
                  autoHeight
                />
              </View>
            ) : null}
            {thumbnail ? (
              <View className="fieldGroup">
                <Text className="fieldLabel">缩略图</Text>
                <View className="thumbnailRow">
                  <Image className="thumbnailPreview" src={thumbnail} mode="aspectFill" />
                  <View className="thumbnailRemove" onClick={() => setThumbnail("")}>
                    <Text className="thumbnailRemoveText">✕</Text>
                  </View>
                </View>
              </View>
            ) : null}
            <Textarea
              ref={contentRef}
              className="contentInput"
              placeholder="补充说明（可选）..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(e) => setContent(e.detail.value)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
            />
          </View>
        );
      case "event":
        return (
          <View className="editorSection">
            <Textarea
              className="titleInput"
              placeholder="活动名称"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => contentRef.current?.focus?.()}
            />
            <View className="fieldGroup fieldGroup--inline">
              <Text className="fieldLabel">活动时间</Text>
              <Picker
                mode="date"
                value={eventTime || formatDate(new Date())}
                onChange={(e) => setEventTime(e.detail.value)}
              >
                <View className="fieldPicker">
                  <Text className={eventTime ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                    {eventTime || "选择日期"}
                  </Text>
                  <Text className="fieldPickerArrow">▼</Text>
                </View>
              </Picker>
            </View>
            <View className="fieldGroup">
              <Text className="fieldLabel">活动地点</Text>
              <View className="locationRow">
                <Input
                  className="fieldInput fieldInput--location"
                  placeholder="线下地址或线上链接"
                  placeholderClass="fieldPlaceholder"
                  cursorColor={BRAND_COLOR}
                  value={eventLocation}
                  onInput={(e) => setEventLocation(e.detail.value)}
                />
                <View className="locationBtn" onClick={() => {
                  Taro.chooseLocation({
                    success: (res) => setEventLocation(res.name || res.address),
                    fail: () => {},
                  });
                }}>
                  <Text className="locationBtnText">定位</Text>
                </View>
              </View>
            </View>
            <Textarea
              ref={contentRef}
              className="contentInput"
              placeholder="活动详情..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(e) => setContent(e.detail.value)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
            />
          </View>
        );
      case "dating":
        return (
          <View className="editorSection">
            <Textarea
              className="titleInput"
              placeholder="一句话介绍自己"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => contentRef.current?.focus?.()}
            />
            <View className="fieldRow">
              <View className="fieldGroup fieldGroup--inline fieldGroup--half">
                <Text className="fieldLabel">性别</Text>
                <RadioGroup onChange={(e) => setGender(e.detail.value)} className="genderRadio">
                  {GENDER_OPTIONS.map((g) => (
                    <Radio
                      key={g}
                      value={g}
                      checked={gender === g}
                      color={BRAND_COLOR}
                      className="genderRadioItem"
                    >
                      {g}
                    </Radio>
                  ))}
                </RadioGroup>
              </View>
              <View className="fieldGroup fieldGroup--inline fieldGroup--half">
                <Text className="fieldLabel">年龄</Text>
                <Picker
                  mode="date"
                  fields="year"
                  value={birthYear || "2000"}
                  onChange={(e) => setBirthYear(e.detail.value)}
                >
                  <View className="fieldPicker">
                    <Text className={age ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                      {age ? `${age}岁` : "选择出生年"}
                    </Text>
                    <Text className="fieldPickerArrow">▼</Text>
                  </View>
                </Picker>
              </View>
            </View>
            <View className="fieldGroup">
              <Text className="fieldLabel">期望对象</Text>
              <Textarea
                className="fieldTextarea"
                placeholder="对另一半的期望..."
                placeholderClass="fieldPlaceholder"
                cursorColor={BRAND_COLOR}
                value={requirements}
                onInput={(e) => setRequirements(e.detail.value)}
                autoHeight
              />
            </View>
            <Textarea
              ref={contentRef}
              className="contentInput"
              placeholder="自我介绍..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(e) => setContent(e.detail.value)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
            />
          </View>
        );
      default:
        return (
          <View className="editorSection">
            <Textarea
              className="titleInput"
              placeholder="标题"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => contentRef.current?.focus?.()}
            />
            <Textarea
              ref={contentRef}
              className="contentInput"
              placeholder="正文内容..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(e) => setContent(e.detail.value)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
            />
          </View>
        );
    }
  };

  return (
    <View className="createTopic">
      <Navbar title="发帖" back home />
      <ScrollView scrollY style={{ height: bodyHeight }} className="createTopicBody" enhanced showScrollbar={false}>
        <View className="section typeSection">
        <Text className="typeLabel">发布类型</Text>
        <View className="typeRow">
          {TOPIC_TYPES.map((t) => (
            <View
              key={t.key}
              className={`typeTag ${topicType === t.key ? "typeTag--active" : ""}`}
              onClick={() => handleTopicTypeChange(t.key)}
            >
              <Text className="typeTagText">{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="section nodeSection">
        {nodeLocked ? (
          <View className="pickerItem">
            <Text className="pickerLabel">发布到</Text>
            <Text className="pickerValue pickerValue--locked">{lockedNodeName}</Text>
          </View>
        ) : (
          <Picker
            mode="multiSelector"
            range={[filteredGroups.map((g) => g.category), currentGroup?.nodes?.map((n) => n.name) || []]}
            value={tempPickerValue}
            onChange={(e) => {
              const val = e.detail.value as [number, number];
              setPickerValue(val);
              setTempPickerValue(val);
              try {
                Taro.setStorageSync(LAST_NODE_KEY, JSON.stringify({ groupIndex: val[0], nodeIndex: val[1] }));
              } catch {}
            }}
            onColumnChange={(e) => {
              const { column, value } = e.detail;
              if (column === 0) {
                setTempPickerValue([value, 0]);
              } else {
                setTempPickerValue([tempPickerValue[0], value]);
              }
            }}
          >
            <View className="pickerItem">
              <Text className="pickerLabel">发布到</Text>
              <Text className="pickerValue">{confirmedNode ? `${confirmedGroup.category} · ${confirmedNode.name}` : "选择板块"}</Text>
              <Text className="arrow">▼</Text>
            </View>
          </Picker>
        )}
      </View>

      {renderForm()}

      </ScrollView>

      <ShareElement mapkey="create_topic_btn">
        <View
          className={`submitBtn ${submitting ? "submitBtn--disabled" : ""}`}
          onClick={handleSubmit}
        >
          {submitting ? "发布中..." : "发布"}
        </View>
      </ShareElement>

      {repostPreview && (
        <View className="repostMask" onClick={cancelRepost}>
          <View className="repostSheet" onClick={(e) => e.stopPropagation()}>
            <View className="repostSheetHeader">
              <Text className="repostSheetTitle">转载确认</Text>
              <View className="repostSheetClose" onClick={cancelRepost}>
                <Text className="repostSheetCloseText">✕</Text>
              </View>
            </View>
            <Text className="repostSheetHint">已读取剪贴板中的链接</Text>
            <ScrollView scrollY className="repostSheetScroll">
              <View className="previewCard">
                {repostPreview.image && (
                  <View className="previewBanner">
                    <Image className="previewBannerImg" src={repostPreview.image} mode="aspectFill" />
                  </View>
                )}
                <View className="previewBody">
                  <View className="previewSite">
                    {repostPreview.favicon ? (
                      <Image className="previewFavicon" src={repostPreview.favicon} />
                    ) : (
                      <View className="previewFaviconPlaceholder">
                        <Text className="previewFaviconText">{(repostPreview.siteName || sourceUrl)[0]}</Text>
                      </View>
                    )}
                    <Text className="previewSiteName">
                      {repostPreview.siteName || sourceUrl}
                    </Text>
                  </View>
                  {repostPreview.title && (
                    <Text className="previewTitle" numberOfLines={2}>{repostPreview.title}</Text>
                  )}
                  {(repostPreview.bodyText || repostPreview.description) && (
                    <Text className="previewBodyText" numberOfLines={5}>{repostPreview.bodyText || repostPreview.description}</Text>
                  )}
                </View>
              </View>
            </ScrollView>
            <View className="repostSheetActions">
              <View className="repostSheetCopy" onClick={() => {
                const copyText = [
                  repostPreview.title,
                  repostPreview.url,
                  repostPreview.description || repostPreview.bodyText,
                ].filter(Boolean).join("\n");
                Taro.setClipboardData({ data: copyText });
              }}>
                <Text className="repostSheetCopyText">复制内容</Text>
              </View>
              <View className="repostSheetCancel" onClick={cancelRepost}>
                <Text className="repostSheetCancelText">取消</Text>
              </View>
              <View className="repostSheetConfirm" onClick={confirmRepost}>
                <Text className="repostSheetConfirmText">转载此文章</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
