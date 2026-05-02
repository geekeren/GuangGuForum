import { View, Text, Textarea, Input, Picker, Radio, RadioGroup, Image, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import { createTopic, fetchLinkSummary } from "guanggu-forum-api";
import type { NodeGroup, LinkSummary } from "guanggu-forum-api";
import {
  getCachedNodeNavigation,
  fetchAndCacheNodeNavigation,
} from "../../utils/nodeNavigation";
import { extractSummaryUrl } from "../../utils/linkHandler";
import { getCachedUsername } from "../../utils/currentUser";
import { openLoginModal } from "../../utils/auth";
import { ClearableInput, ClearableTextarea } from "../../components/ClearableInput";
import Navbar from "../../components/Navbar";
import LinkPreviewCard from "../../components/LinkPreviewCard";
import MarkdownRender from "../../components/MarkdownRender";
import { htmlToMarkdown } from "../../utils/htmlToMarkdown";
import { BRAND_COLOR } from "../../utils/theme";
import "./index.scss";

const LAST_NODE_KEY = "last_selected_node";
const DRAFT_KEY = "topic_draft";

const DEBUG = false;

type TopicType = "normal" | "repost" | "event" | "dating";

const TOPIC_TYPES: { key: TopicType; label: string; node: string | null }[] = [
  { key: "normal", label: "普通", node: null },
  { key: "repost", label: "转载", node: "water" },
  { key: "event", label: "活动", node: "lowshine" },
  { key: "dating", label: "相亲贴", node: "date" },
];

const HIDDEN_NODES = ["lowshine", "date"];

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
  const [selectedNodeSlug, setSelectedNodeSlug] = useState("water");
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [nodePickerClosing, setNodePickerClosing] = useState(false);
  const [repostClosing, setRepostClosing] = useState(false);
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
  const [fullRepost, setFullRepost] = useState(true);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventHour, setEventHour] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const eventTime = [eventDate, eventHour].filter(Boolean).join(" ");
  // 相亲专用
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [requirements, setRequirements] = useState("");

  const contentRef = useRef<any>(null);
  const nextFocusRef = useRef<any>(null);
  const prevFocusRef = useRef<any>(null);
  const sourceUrlRef = useRef<any>(null);
  const eventLocationRef = useRef<any>(null);
  const requirementsRef = useRef<any>(null);
  const titleRef = useRef<any>(null);
  const [bodyHeight, setBodyHeight] = useState("100vh");
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");

  useEffect(() => {
    const sys = Taro.getSystemInfoSync();
    const navH = 44 + (sys.statusBarHeight || 0);
    const safeBottom = sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0;
    const btnAreaH = 28 + 56 + 16 + safeBottom; // margin-top + btn(56rpx≈28px) + margin-bottom + safe
    setBodyHeight(`calc(100vh - ${navH + btnAreaH}px)`);
    nextFocusRef.current = contentRef.current;
  }, []);

  const age = birthYear ? String(new Date().getFullYear() - parseInt(birthYear)) : "";

  const currentTypeConfig = TOPIC_TYPES.find((t) => t.key === topicType)!;
  const nodeLocked = topicType !== "normal";

  const filteredGroups = nodeGroups.map((g) => ({
    ...g,
    nodes: g.nodes.filter((n) => !HIDDEN_NODES.includes(n.slug)),
  })).filter((g) => g.nodes.length > 0);

  const restoreNodeSelection = (groups: NodeGroup[], preferSlug?: string) => {
    const target = preferSlug || (() => {
      try {
        const saved = Taro.getStorageSync(LAST_NODE_KEY);
        if (saved) {
          const { slug } = JSON.parse(saved);
          if (slug) return slug;
        }
      } catch {}
      return null;
    })() || "water";
    const exists = groups.some((g) => g.nodes.some((n) => n.slug === target));
    setSelectedNodeSlug(exists ? target : "water");
  };

  const router = useRouter();
  const nodeSlug = router.params.node;

  useEffect(() => {
    const cached = getCachedNodeNavigation();
    if (cached.length) {
      setNodeGroups(cached);
      restoreNodeSelection(cached, nodeSlug);
    }
    fetchAndCacheNodeNavigation().then((groups) => {
      setNodeGroups(groups);
      restoreNodeSelection(groups, nodeSlug);
    });
    if (!getCachedUsername()) {
      setTimeout(() => openLoginModal(), 500);
    }
  }, []);

  useEffect(() => {
    if (topicType === "normal" && nodeGroups.length > 0) {
      const isValid = filteredGroups.some((g) => g.nodes.some((n) => n.slug === selectedNodeSlug));
      if (!isValid) {
        setSelectedNodeSlug("water");
      }
    }
  }, [topicType, nodeGroups]);

  // 恢复草稿
  useEffect(() => {
    try {
      const raw = Taro.getStorageSync(DRAFT_KEY);
      if (!raw) { setDraftRestored(true); return; }
      const d = JSON.parse(raw);
      if (d.savedAt) setDraftSavedAt(d.savedAt);
      if (d.topicType) setTopicType(d.topicType);
      if (d.title) setTitle(d.title);
      if (d.content) setContent(d.content);
      if (d.selectedNodeSlug) setSelectedNodeSlug(d.selectedNodeSlug);
      if (d.sourceUrl) setSourceUrl(d.sourceUrl);
      if (d.sourceTitle) setSourceTitle(d.sourceTitle);
      if (d.summary) setSummary(d.summary);
      if (d.thumbnail) setThumbnail(d.thumbnail);
      if (d.eventDate) setEventDate(d.eventDate);
      if (d.eventHour) setEventHour(d.eventHour);
      if (d.fullRepost !== undefined) setFullRepost(d.fullRepost);
      if (d.eventDate) setEventDate(d.eventDate);
      if (d.eventHour) setEventHour(d.eventHour);
      if (d.eventLocation) setEventLocation(d.eventLocation);
      if (d.gender) setGender(d.gender);
      if (d.birthYear) setBirthYear(d.birthYear);
      if (d.requirements) setRequirements(d.requirements);
    } catch {}
    setDraftRestored(true);
  }, []);

  // 自动保存草稿
  useEffect(() => {
    if (!draftRestored) return;
    const hasContent = title || content || sourceUrl || eventTime || gender || requirements;
    if (!hasContent) { setDraftSavedAt(""); return; }
    const timer = setTimeout(() => {
      const savedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      try {
        Taro.setStorageSync(DRAFT_KEY, JSON.stringify({
          savedAt,
          topicType, title, content, selectedNodeSlug,
          sourceUrl, sourceTitle, summary, thumbnail, eventDate, eventHour, eventLocation, fullRepost,
          sourceUrl, sourceTitle, summary, thumbnail, eventDate, eventHour, eventLocation, fullRepost,
          gender, birthYear, requirements,
        }));
        setDraftSavedAt(savedAt);
      } catch {}
    }, 800);
    return () => clearTimeout(timer);
  }, [draftRestored, topicType, title, content, selectedNodeSlug, sourceUrl, sourceTitle, summary, thumbnail, eventDate, eventHour, eventLocation, fullRepost, gender, birthYear, requirements]);

  const clearForm = () => {
    setTitle("");
    setContent("");
    setSourceUrl("");
    setSourceTitle("");
    setSummary("");
    setThumbnail("");
    setFullRepost(true);
    setEventDate("");
    setEventHour("");
    setEventLocation("");
    setGender("");
    setBirthYear("");
    setRequirements("");
    setDraftSavedAt("");
    try { Taro.removeStorageSync(DRAFT_KEY); } catch {}
  };

  const openNodePicker = () => {
    if (nodeLocked) return;
    setNodePickerClosing(false);
    setShowNodePicker(true);
  };

  const closeNodePicker = () => {
    setNodePickerClosing(true);
    setTimeout(() => {
      setShowNodePicker(false);
      setNodePickerClosing(false);
    }, 250);
  };

  const selectNode = (slug: string) => {
    setSelectedNodeSlug(slug);
    try {
      Taro.setStorageSync(LAST_NODE_KEY, JSON.stringify({ slug }));
    } catch {}
    closeNodePicker();
  };

  const resolvedNodeSlug = nodeLocked ? currentTypeConfig.node! : selectedNodeSlug;

  const resolvedNodeName = (() => {
    if (!resolvedNodeSlug) return "选择板块";
    for (const group of nodeGroups) {
      const found = group.nodes.find((n) => n.slug === resolvedNodeSlug);
      if (found) return found.name;
    }
    return resolvedNodeSlug;
  })();

  const handleTopicTypeChange = (type: TopicType) => {
    setTopicType(type);
    const refMap: Record<TopicType, any> = {
      repost: sourceUrlRef,
      event: eventLocationRef,
      dating: requirementsRef,
      normal: contentRef,
    };
    nextFocusRef.current = refMap[type]?.current || contentRef.current;
    if (type === "repost" && !sourceUrl) {
      Taro.getClipboardData({
        success: (res) => {
          const url = extractSummaryUrl((res.data || "").trim());
          if (url) {
            setClipLoading(true);
            fetchLinkSummary(url).then((info: LinkSummary) => {
              setClipLoading(false);
              setRepostPreview({ ...info, url });
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
    if (info.bodyHtml) {
      const md = htmlToMarkdown(info.bodyHtml);
      if (fullRepost) {
        setSummary(md);
      } else {
        const noImages = md.replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "");
        const lines = noImages.split("\n").filter((l) => l.trim());
        setSummary(lines.slice(0, 10).join("\n") + (lines.length > 10 ? "\n......" : ""));
      }
    } else if (info.bodyText || info.description) {
      setSummary((info.bodyText || info.description).slice(0, 400));
    }
    setContent("大家怎么看");
    setRepostPreview(null);
    setTimeout(() => {
      contentRef.current?.focus?.();
    }, 100);
  };

  const cancelRepost = () => {
    setRepostClosing(true);
    setTimeout(() => {
      setRepostPreview(null);
      setRepostClosing(false);
    }, 250);
  };

  const handleTitleInput = (val: string) => {
    if (val.includes("\n")) {
      const parts = val.split("\n");
      const newTitle = parts[0];
      const restContent = parts.slice(1).join("\n");
      setTitle(newTitle);
      setContent((prev) => restContent + (prev ? "\n" + prev : ""));
      setTimeout(() => {
        nextFocusRef.current?.focus?.();
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
        if (fullRepost && summary) {
          return `${thumbPart}> 转载自 [${linkText}](${sourceUrl})\n\n${summary}\n\n${content}${FROM_MINI}`;
        }
        const summaryPart = summary ? `\n\n**下面是摘要：**\n\n${summary}` : "";
        return `${thumbPart}> 转载自 [${linkText}](${sourceUrl})${summaryPart}\n\n${content}${FROM_MINI}`;
      }
      case "event": {
        return `## 📅 活动信息\n\n- 时间：${eventTime}\n- 地点：${eventLocation}\n\n## 📋 活动详情\n\n${content}${FROM_MINI}`;
      }
      case "dating": {
        return `## 👤 基本信息\n\n- 性别：${gender}\n- 年龄：${age}\n\n## 💕 期望\n\n${requirements}\n\n## ✍️ 自我介绍\n\n${content}\n\n\n\n${FROM_MINI}`;
      }
      default:
        return `${content}${FROM_MINI}`;
    }
  };

  const validateForm = (): string | null => {
    if (!getCachedUsername()) {
      openLoginModal();
      return null;
    }
    const resolvedNode = nodeLocked ? currentTypeConfig.node : selectedNodeSlug;
    if (!resolvedNode) {
      Taro.showToast({ title: "请选择板块", icon: "none" });
      return null;
    }
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return null;
    }
    const finalContent = buildContent().trim();
    if (!finalContent) {
      Taro.showToast({ title: "请输入内容", icon: "none" });
      return null;
    }
    if (topicType === "repost" && !sourceUrl.trim()) {
      Taro.showToast({ title: "请填写原文链接", icon: "none" });
      return null;
    }
    if (topicType === "event" && (!eventTime.trim() || !eventLocation.trim())) {
      Taro.showToast({ title: "请填写活动时间和地点", icon: "none" });
      return null;
    }
    if (topicType === "dating" && (!gender.trim() || !age.trim())) {
      Taro.showToast({ title: "请填写基本信息", icon: "none" });
      return null;
    }
    return finalContent;
  };

  const handleSubmit = () => {
    const finalContent = validateForm();
    if (!finalContent) return;
    setPreviewContent(finalContent);
  };

  const closePreview = () => {
    setPreviewClosing(true);
    setTimeout(() => {
      setPreviewContent(null);
      setPreviewClosing(false);
    }, 250);
  };

  const confirmSubmit = async () => {
    const finalContent = previewContent;
    if (!finalContent) return;
    const resolvedNode = nodeLocked ? currentTypeConfig.node : selectedNodeSlug;
    setPreviewContent(null);
    setSubmitting(true);
    Taro.showLoading({ title: "发布中...", mask: true });
    try {
      await createTopic({
        node: resolvedNode!,
        title: title.trim(),
        content: finalContent,
      });
      Taro.hideLoading();
      try { Taro.removeStorageSync(DRAFT_KEY); } catch {}
      Taro.eventCenter.trigger("refreshTopics");
      Taro.navigateBack();
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: "发布失败", icon: "none" });
    } finally {
      setSubmitting(false);
    }
  };

  const focusRef = (r: any) => r?.current?.focus?.();

  const renderForm = () => {
    switch (topicType) {
      case "repost":
        return (
          <View className="editorSection">
            {!sourceUrl && (
              <View className="repostTip">
                <Text className="repostTipText">自动读取剪贴板链接用于转载，也可手动输入</Text>
              </View>
            )}
            <View className="fieldGroup">
              <Text className="fieldLabel">原文链接</Text>
              <ClearableInput
                ref={sourceUrlRef}
                className="fieldInput"
                placeholder="粘贴原文链接"
                placeholderClass="fieldPlaceholder"
                cursorColor={BRAND_COLOR}
                value={sourceUrl}
                onInput={(v) => setSourceUrl(v)}
                onDeleteWhenEmpty={() => focusRef(titleRef)}
                onBlur={() => {
                  const url = extractSummaryUrl(sourceUrl) || (sourceUrl.trim().startsWith("http") ? sourceUrl.trim() : "");
                  if (!url || repostPreview) return;
                  setClipLoading(true);
                  fetchLinkSummary(url).then((info: LinkSummary) => {
                    setClipLoading(false);
                    setRepostPreview({ ...info, url });
                  }).catch(() => {
                    setClipLoading(false);
                  });
                }}
              />
            </View>
            <ClearableTextarea
              ref={titleRef}
              className="titleInput"
              placeholder="标题"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => focusRef(sourceUrlRef)}
              onDeleteWhenEmpty={() => focusRef(sourceUrlRef)}
            />
            {sourceUrl ? (
              <View className="fieldGroup">
                <Text className="fieldLabel">摘要</Text>
                <ClearableTextarea
                  className="fieldTextarea"
                  placeholder="文章摘要（可选）..."
                  placeholderClass="fieldPlaceholder"
                  cursorColor={BRAND_COLOR}
                  maxlength={-1}
                  value={summary}
                  onInput={(v) => setSummary(v)}
                  onDeleteWhenEmpty={() => focusRef(titleRef)}
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
            <ClearableTextarea
              ref={contentRef}
              className="contentInput"
              placeholder="补充说明（可选）..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(v) => setContent(v)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
              onDeleteWhenEmpty={() => focusRef(titleRef)}
            />
          </View>
        );
      case "event":
        return (
          <View className="editorSection">
            <ClearableTextarea
              ref={titleRef}
              className="titleInput"
              placeholder="活动名称"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => focusRef(eventLocationRef)}
              onDeleteWhenEmpty={() => focusRef(eventLocationRef)}
            />
            <View className="fieldGroup fieldGroup--inline">
              <Text className="fieldLabel">活动时间</Text>
              <Picker
                mode="date"
                value={eventDate || formatDate(new Date())}
                onChange={(e) => setEventDate(e.detail.value)}
              >
                <View className="fieldPicker">
                  <Text className={eventDate ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                    {eventDate || "选择日期"}
                  </Text>
                  <Text className="fieldPickerArrow">▼</Text>
                </View>
              </Picker>
              <Picker
                mode="time"
                value={eventHour || "09:00"}
                onChange={(e) => setEventHour(e.detail.value)}
              >
                <View className="fieldPicker">
                  <Text className={eventHour ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                    {eventHour || "选择时间"}
                  </Text>
                  <Text className="fieldPickerArrow">▼</Text>
                </View>
              </Picker>
            </View>
            <View className="fieldGroup">
              <Text className="fieldLabel">活动地点</Text>
              <View className="locationRow">
                <ClearableInput
                  ref={eventLocationRef}
                  className="fieldInput fieldInput--location"
                  placeholder="线下地址或线上链接"
                  placeholderClass="fieldPlaceholder"
                  cursorColor={BRAND_COLOR}
                  value={eventLocation}
                  onInput={(v) => setEventLocation(v)}
                  onDeleteWhenEmpty={() => focusRef(titleRef)}
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
            <ClearableTextarea
              ref={contentRef}
              className="contentInput"
              placeholder="活动详情..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(v) => setContent(v)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
              onDeleteWhenEmpty={() => focusRef(eventLocationRef)}
            />
          </View>
        );
      case "dating":
        return (
          <View className="editorSection">
            <ClearableTextarea
              ref={titleRef}
              className="titleInput"
              placeholder="一句话介绍自己"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => focusRef(requirementsRef)}
              onDeleteWhenEmpty={() => focusRef(requirementsRef)}
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
              <ClearableTextarea
                ref={requirementsRef}
                className="fieldTextarea"
                placeholder="对另一半的期望..."
                placeholderClass="fieldPlaceholder"
                cursorColor={BRAND_COLOR}
                value={requirements}
                onInput={(v) => setRequirements(v)}
                autoHeight
                onDeleteWhenEmpty={() => focusRef(titleRef)}
              />
            </View>
            <ClearableTextarea
              ref={contentRef}
              className="contentInput"
              placeholder="自我介绍..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(v) => setContent(v)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
              onDeleteWhenEmpty={() => focusRef(requirementsRef)}
            />
          </View>
        );
      default:
        return (
          <View className="editorSection">
            <ClearableTextarea
              ref={titleRef}
              className="titleInput"
              placeholder="标题"
              placeholderClass="titlePlaceholder"
              cursorColor={BRAND_COLOR}
              maxlength={120}
              value={title}
              onInput={handleTitleInput}
              autoHeight
              confirmType="next"
              onConfirm={() => focusRef(contentRef)}
              onDeleteWhenEmpty={() => focusRef(contentRef)}
            />
            <ClearableTextarea
              ref={contentRef}
              className="contentInput"
              placeholder="正文内容..."
              placeholderClass="contentPlaceholder"
              cursorColor={BRAND_COLOR}
              value={content}
              onInput={(v) => setContent(v)}
              autoHeight
              cursorSpacing={100}
              adjustPosition
              onDeleteWhenEmpty={() => focusRef(titleRef)}
            />
          </View>
        );
    }
  };

  return (
    <View className="createTopic">
      <Navbar title="发帖" back home titleStyle={{ opacity: 1 }} />
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
        <View className="pickerItem" onClick={openNodePicker}>
          <Text className="pickerLabel">发布到</Text>
          <Text className={`pickerValue ${nodeLocked ? "pickerValue--locked" : ""}`}>
            {resolvedNodeName}
          </Text>
          {!nodeLocked && <Text className="arrow">▼</Text>}
        </View>
      </View>

      {renderForm()}

      </ScrollView>

      {draftSavedAt && (
        <Text className="draftTime">草稿已保存于 {draftSavedAt}</Text>
      )}

      <View className="btnRow">
        <View className="clearBtn" onClick={clearForm}>
          <Text className="clearBtnText">清空</Text>
        </View>
        <View
          className={`submitBtn ${submitting ? "submitBtn--disabled" : ""}`}
          onClick={handleSubmit}
        >
          <Text className="submitBtnText">{submitting ? "发布中..." : "预览"}</Text>
        </View>
      </View>

      {repostPreview && (
        <View className={`repostMask${repostClosing ? " repostMask--closing" : ""}`} onClick={cancelRepost}>
          <View className={`repostSheet${repostClosing ? " repostSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <View className="repostSheetHeader">
              <Text className="repostSheetTitle">转载确认</Text>
              <View className="repostSheetClose" onClick={cancelRepost}>
                <Text className="repostSheetCloseText">✕</Text>
              </View>
            </View>
            <Text className="repostSheetHint">已读取剪贴板中的链接</Text>
            <View className="repostSheetOptions">
              <View className="repostCheckbox" onClick={() => setFullRepost(!fullRepost)}>
                <View className={`repostCheckboxBox${fullRepost ? " repostCheckboxBox--checked" : ""}`}>
                  {fullRepost && <Text className="repostCheckboxTick">✓</Text>}
                </View>
                <Text className="repostCheckboxLabel">原文转载</Text>
              </View>
              <Text className="repostCheckboxDesc">{fullRepost ? "转载完整正文内容" : "仅转载文章摘要"}</Text>
            </View>
            <ScrollView scrollY className="repostSheetScroll">
              <LinkPreviewCard summary={repostPreview} url={sourceUrl} />
            </ScrollView>
            <View className="repostSheetActions">
              <View className="repostSheetCancel" onClick={cancelRepost}>
                <Text className="repostSheetCancelText">取消</Text>
              </View>
              <View className="repostSheetConfirm" onClick={confirmRepost}>
                <Text className="repostSheetConfirmText">{fullRepost ? "原文转载" : "转载摘要"}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {previewContent && (
        <View className={`repostMask${previewClosing ? " repostMask--closing" : ""}`} onClick={closePreview}>
          <View className={`repostSheet${previewClosing ? " repostSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <View className="repostSheetHeader">
              <Text className="repostSheetTitle">预览</Text>
              <View className="repostSheetClose" onClick={closePreview}>
                <Text className="repostSheetCloseText">✕</Text>
              </View>
            </View>
            <ScrollView scrollY className="repostSheetScroll" style={{ height: "calc(80vh - 200rpx - env(safe-area-inset-bottom))" }}>
              <View className="previewContentWrap">
                <Text className="previewContentTitle">{title.trim()}</Text>
                <MarkdownRender content={previewContent} />
              </View>
            </ScrollView>
            <View className="repostSheetActions">
              <View className="repostSheetCancel" onClick={closePreview}>
                <Text className="repostSheetCancelText">取消</Text>
              </View>
              <View className="repostSheetConfirm" onClick={confirmSubmit}>
                <Text className="repostSheetConfirmText">确认发布</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {showNodePicker && (
        <View className={`nodePickerMask${nodePickerClosing ? " nodePickerMask--closing" : ""}`} onClick={closeNodePicker}>
          <View className={`nodePickerSheet${nodePickerClosing ? " nodePickerSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <View className="nodePickerHeader">
              <Text className="nodePickerTitle">选择板块</Text>
              <View className="nodePickerClose" onClick={closeNodePicker}>
                <Text className="nodePickerCloseText">✕</Text>
              </View>
            </View>
            <ScrollView scrollY className="nodePickerScroll">
              {filteredGroups.map((group) => (
                <View className="nodeGroup" key={group.category}>
                  <Text className="nodeGroupLabel">{group.category}</Text>
                  <View className="nodeGroupTags">
                    {group.nodes.map((node) => (
                      <View
                        key={node.slug}
                        className={`nodeTag ${selectedNodeSlug === node.slug ? "nodeTag--active" : ""}`}
                        onClick={() => selectNode(node.slug)}
                      >
                        <Text className="nodeTagText">{node.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
