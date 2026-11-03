import { getScrollViewType } from "../../utils/renderer";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import { createTopic } from "guanggu-forum-api";
import type { NodeGroup } from "guanggu-forum-api";
import {
  getCachedNodeNavigation,
  fetchAndCacheNodeNavigation,
} from "../../utils/nodeNavigation";
import { getCachedUsername } from "../../utils/currentUser";
import { openLoginModal } from "../../utils/auth";
import { cacheService, CacheCategory } from "../../utils/CacheService";
import Navbar from "../../components/Navbar";
import HtmlRender from "../../components/HtmlRender";
import NodePicker from "../../components/NodePicker";
import { TOPIC_TYPE_REGISTRY, ALL_TYPES, ALL_HIDDEN_NODES } from "./topicTypes/registry";
import type { TopicType } from "./topicTypes/registry";
import { isSkyline } from "../../utils/renderer";
import TopicEditor, { restoreTopicAttachments, type TopicAttachment } from './TopicEditor';
import { serializeTopicDocumentHtml, topicMarkdownToSafeHtml, escapeTopicHtml, isSafeTopicImageUrl, type TopicDocument } from '../../utils/topicDocument';
import type { EditorSnapshot } from './RichTopicBody';
import "./index.scss";

const LAST_NODE_KEY = "last_selected_node";
const LAST_DRAFT_KEY = "topic_draft_last";

function getDraftKey(type: TopicType, nodeSlug: string): string {
  return `topic_draft_${type}_${nodeSlug}`;
}

function hasContent(title: string, content: string, typeFields: Record<string, any>): boolean {
  if (title || content) return true;
  return Object.values(typeFields).some((v) => typeof v === "string" && v.trim());
}

const FROM_MINI = '<p><em>本帖发自<a href="https://www.guozaoke.com/t/91893">小程序</a></em></p>';

export default function CreateTopic() {
  const skyline = isSkyline();
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [selectedNodeSlug, setSelectedNodeSlug] = useState("water");
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [topicType, setTopicType] = useState<TopicType>("normal");
  const [typeFields, setTypeFields] = useState<Record<string, any>>({});
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [bodyHeight, setBodyHeight] = useState("100vh");
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, TopicAttachment[]>>({});
  const [editorRevision, setEditorRevision] = useState(0);
  const [document, setDocument] = useState<TopicDocument | undefined>(undefined);
  const active = useRef(true);
  const snapshotLock = useRef(false);
  const bodySnapshot = useRef<EditorSnapshot>({ markdown: '', errors: [], unsupported: [] });
  const snapshotBoundary = useRef(0);
  useEffect(() => () => { active.current = false; snapshotBoundary.current++; }, []);
  const submitLock = useRef(false);
  const published = useRef(false);
  const previewContext = useRef<{ title: string; node: string; owner: string; boundary: number } | null>(null);

  const refMap = useRef<Record<string, any>>({});
  const getRef = (key: string) => {
    if (!refMap.current[key]) {
      refMap.current[key] = { current: null };
    }
    return refMap.current[key];
  };

  const focusRef = (r: any) => r?.current?.focus?.();
  const updateBody = (markdown: string, nextDocument?: TopicDocument) => {
    bodySnapshot.current = { markdown, document: nextDocument, errors: [], unsupported: [] };
    setContent(markdown); setDocument(nextDocument);
  };
  const snapshotBody = async (): Promise<EditorSnapshot> => {
    const boundary = snapshotBoundary.current;
    const editor = getRef('content').current;
    if (!editor?.snapshot) throw new Error('Editor unavailable');
    const result: EditorSnapshot = await editor.snapshot();
    if (!active.current || boundary !== snapshotBoundary.current) throw new Error('Editor changed');
    bodySnapshot.current = result;
    setContent(result.markdown); setDocument(result.document);
    return result;
  };

  const currentDef = TOPIC_TYPE_REGISTRY[topicType];
  const nodeLocked = topicType !== "normal";

  const resolvedNodeSlug = nodeLocked ? currentDef.node! : selectedNodeSlug;
  const attachmentDraftKey = getDraftKey(topicType, resolvedNodeSlug || 'water');
  const attachments = attachmentDrafts[attachmentDraftKey] ?? [];

  const resolvedNodeName = (() => {
    if (!resolvedNodeSlug) return "选择板块";
    for (const group of nodeGroups) {
      const found = group.nodes.find((n) => n.slug === resolvedNodeSlug);
      if (found) return found.name;
    }
    return resolvedNodeSlug;
  })();

  const filteredGroups = nodeGroups.map((g) => ({
    ...g,
    nodes: g.nodes.filter((n) => !ALL_HIDDEN_NODES.includes(n.slug)),
  })).filter((g) => g.nodes.length > 0);

  const setField = (key: string, value: any) => {
    setTypeFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleTitleInput = (val: string) => {
    if (val.includes("\n")) {
      const parts = val.split("\n");
      const newTitle = parts[0];
      const restContent = parts.slice(1).join("\n");
      setTitle(newTitle);
      if (document) void getRef('content').current?.insertText?.(restContent + '\n');
      else updateBody(restContent + (bodySnapshot.current.markdown ? "\n" + bodySnapshot.current.markdown : ""));
      setTimeout(() => {
        const contentRef = getRef("content");
        contentRef?.current?.focus?.();
      }, 50);
    } else {
      setTitle(val);
    }
  };

  // Body height
  useEffect(() => {
    if (skyline) return;
    const sys = Taro.getSystemInfoSync();
    const navH = 44 + (sys.statusBarHeight || 0);
    const safeBottom = sys.safeArea ? sys.screenHeight - sys.safeArea.bottom : 0;
    const btnAreaH = 28 + 56 + 16 + safeBottom;
    setBodyHeight(`calc(100vh - ${navH + btnAreaH}px)`);
  }, []);

  // Node navigation
  const restoreNodeSelection = (groups: NodeGroup[], preferSlug?: string) => {
    const target = preferSlug || (() => {
      const saved = cacheService.get<{ slug: string }>(LAST_NODE_KEY);
      if (saved?.slug) return saved.slug;
      return null;
    })() || "water";
    const exists = groups.some((g) => g.nodes.some((n) => n.slug === target));
    setSelectedNodeSlug(!groups.length || exists ? target : "water");
  };

  const router = useRouter();
  const nodeSlug = router.params.node;

  useEffect(() => {
    const cached = getCachedNodeNavigation();
    if (cached.length) setNodeGroups(cached);
    restoreNodeSelection(cached, nodeSlug);
    let active = true;
    fetchAndCacheNodeNavigation().then((groups) => {
      if (!active) return;
      setNodeGroups(groups);
      // A delayed refresh must not undo a node the user or draft selected meanwhile.
      setSelectedNodeSlug(current => !groups.length || groups.some(group => group.nodes.some(node => node.slug === current)) ? current : "water");
    }).catch(() => {});
    const loginTimer = !getCachedUsername() ? setTimeout(() => openLoginModal(), 500) : undefined;
    return () => {
      active = false;
      clearTimeout(loginTimer);
    };
  }, []);

  // Validate selected node when switching to normal type
  useEffect(() => {
    if (topicType === "normal" && nodeGroups.length > 0) {
      const isValid = filteredGroups.some((g) => g.nodes.some((n) => n.slug === selectedNodeSlug));
      if (!isValid) {
        setSelectedNodeSlug("water");
      }
    }
  }, [topicType, nodeGroups]);

  // Restore draft — read last active type first
  useEffect(() => {
    const lastMeta = cacheService.get<{ topicType: TopicType; nodeSlug: string }>(LAST_DRAFT_KEY);
    let draftType: TopicType = "normal";
    let draftNode = "water";
    if (lastMeta?.topicType) draftType = lastMeta.topicType;
    if (lastMeta?.nodeSlug) draftNode = lastMeta.nodeSlug;
    const draftKey = getDraftKey(draftType, draftNode);
    const d = cacheService.get<{ savedAt: string; title: string; content: string; document?: TopicDocument; typeFields: Record<string, any>; attachments?: unknown }>(draftKey);
    if (d) {
      setTopicType(draftType);
      if (draftType === "normal") setSelectedNodeSlug(draftNode);
      if (d.savedAt) setDraftSavedAt(d.savedAt);
      if (d.title) setTitle(d.title);
      updateBody(d.content || '', d.document);
      if (d.typeFields) setTypeFields(d.typeFields);
      setAttachmentDrafts(prev => ({ ...prev, [draftKey]: restoreTopicAttachments(d.attachments) }));
    }
    setDraftRestored(true);
  }, []);

  useEffect(() => {
    if (!draftRestored) return;
    setAttachmentDrafts(prev => {
      if (attachmentDraftKey in prev) return prev;
      const saved = cacheService.get<{ attachments?: unknown }>(attachmentDraftKey);
      return { ...prev, [attachmentDraftKey]: restoreTopicAttachments(saved?.attachments) };
    });
  }, [draftRestored, attachmentDraftKey]);

  // Auto-save draft — isolated by type + node
  useEffect(() => {
    if (!draftRestored) return;
    if (!hasContent(title, content, typeFields) && !attachments.length) { setDraftSavedAt(""); return; }
    const timer = setTimeout(() => {
      const savedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const draftKey = getDraftKey(topicType, resolvedNodeSlug || "water");
      cacheService.set(draftKey, { savedAt, title, content: bodySnapshot.current.markdown, document: bodySnapshot.current.document, typeFields, attachments }, { category: CacheCategory.Topic });
      cacheService.set(LAST_DRAFT_KEY, { topicType, nodeSlug: resolvedNodeSlug || "water" }, { category: CacheCategory.Topic });
      setDraftSavedAt(savedAt);
    }, 800);
    return () => clearTimeout(timer);
  }, [draftRestored, topicType, title, content, document, resolvedNodeSlug, typeFields, attachments]);

  const saveOnLeave = () => {
    if (published.current || !draftRestored || (!hasContent(title, content, typeFields) && !attachments.length)) return;
    const boundary = snapshotBoundary.current;
    const persist = (result = bodySnapshot.current) => {
      if (published.current || boundary !== snapshotBoundary.current) return;
      const savedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      cacheService.set(attachmentDraftKey, { savedAt, title, content: result.markdown, document: result.document, typeFields, attachments }, { category: CacheCategory.Topic });
      cacheService.set(LAST_DRAFT_KEY, { topicType, nodeSlug: resolvedNodeSlug || 'water' }, { category: CacheCategory.Topic });
    };
    persist(); // Retain the latest event snapshot even if native unload cannot complete an async read.
    void getRef('content').current?.snapshot?.().then(result => persist(result)).catch(() => {});
  };
  Taro.useDidHide(saveOnLeave);
  Taro.useUnload(saveOnLeave);

  const clearForm = () => {
    if (submitting || submitLock.current || snapshotLock.current || previewContent) return;
    setTitle("");
    snapshotBoundary.current++;
    updateBody('');
    setTypeFields(currentDef.initialFields);
    setDraftSavedAt("");
    setAttachmentDrafts(prev => ({ ...prev, [attachmentDraftKey]: [] }));
    setEditorRevision(prev => prev + 1);
    const draftKey = getDraftKey(topicType, resolvedNodeSlug || "water");
    cacheService.remove(draftKey);
    cacheService.remove(LAST_DRAFT_KEY);
  };

  const openNodePicker = () => {
    if (nodeLocked) return;
    setShowNodePicker(true);
  };

  const closeNodePicker = () => setShowNodePicker(false);

  const selectNode = async (slug: string) => {
    if (submitting || submitLock.current || snapshotLock.current || previewContent) return;
    snapshotLock.current = true;
    try { await snapshotBody(); } catch { snapshotLock.current = false; return; }
    saveOnLeave(); snapshotBoundary.current++;
    snapshotLock.current = false;
    setSelectedNodeSlug(slug);
    cacheService.set(LAST_NODE_KEY, { slug }, { category: CacheCategory.Topic });
    closeNodePicker();
  };

  const handleTopicTypeChange = async (type: TopicType) => {
    if (submitting || submitLock.current || snapshotLock.current || previewContent || type === topicType) return;
    snapshotLock.current = true;
    try { await snapshotBody(); } catch { snapshotLock.current = false; return; }
    snapshotLock.current = false;
    snapshotBoundary.current++;
    // Save current draft before switching
    const currentDraftKey = getDraftKey(topicType, resolvedNodeSlug || "water");
    if (hasContent(title, content, typeFields) || attachments.length) {
      const savedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      cacheService.set(currentDraftKey, { savedAt, title, content: bodySnapshot.current.markdown, document: bodySnapshot.current.document, typeFields, attachments }, { category: CacheCategory.Topic });
    } else {
      cacheService.remove(currentDraftKey);
    }

    // Compute new node slug
    const def = TOPIC_TYPE_REGISTRY[type];
    let newNodeSlug = type !== "normal" ? def.node! : selectedNodeSlug;
    if (type === "normal" && nodeGroups.length > 0) {
      const isValid = filteredGroups.some((g) => g.nodes.some((n) => n.slug === newNodeSlug));
      if (!isValid) newNodeSlug = "water";
    }

    // Load new type's draft or reset to initialFields
    const newDraftKey = getDraftKey(type, newNodeSlug || "water");
    let newTitle = "";
    let newContent = "";
    let newFields = def.initialFields;
    let newSavedAt = "";
    const d = cacheService.get<{ title: string; content: string; document?: TopicDocument; typeFields: Record<string, any>; savedAt: string }>(newDraftKey);
    if (d) {
      newTitle = d.title || "";
      newContent = d.content || "";
      newFields = d.typeFields || def.initialFields;
      newSavedAt = d.savedAt || "";
    }

    // Update LAST_DRAFT_KEY immediately
    cacheService.set(LAST_DRAFT_KEY, { topicType: type, nodeSlug: newNodeSlug || "water" }, { category: CacheCategory.Topic });

    // Update all state at once (batched)
    setTopicType(type);
    setTitle(newTitle);
    updateBody(newContent, d?.document);
    setTypeFields(newFields);
    setDraftSavedAt(newSavedAt);

    // Call onActivate with the new fields
    const result = def.onActivate?.({ fields: newFields, setField, getRef });
    const contentRef = getRef("content");
    nextFocusRef.current = result?.current ?? contentRef.current;
  };

  const nextFocusRef = useRef<any>(null);

  // Source roundtrips retain public image URLs but may drop native attachment tags.
  const referencedAttachmentIds = (snapshot: EditorSnapshot, taggedIds: readonly string[] = []) => {
    const imageUrls = snapshot.document?.delta.ops.flatMap(op => typeof op.insert === 'object' && typeof op.insert.image === 'string' ? [op.insert.image] : []);
    const matchedIds = attachments.flatMap(item => {
      const url = item.kind === 'photo' ? item.url : item.sticker.url;
      if (!url) return [];
      const encodedUrl = url.replace(/\(/g, '%28').replace(/\)/g, '%29');
      const referenced = imageUrls ? imageUrls.some(src => src === url || src === encodedUrl)
        : snapshot.markdown.includes(url) || snapshot.markdown.includes(encodedUrl);
      return referenced ? [item.id] : [];
    });
    return [...new Set([...taggedIds, ...matchedIds])];
  };
  const buildContent = (bodyHtml: string, referencedIds: string[]): string => {
    const body = currentDef.buildContent(typeFields, { title, content: bodyHtml, fromMini: '' });
    const referenced = new Set(referencedIds);
    const images = attachments.flatMap(item => {
      if (item.richManaged || referenced.has(item.id)) return [];
      const url = item.kind === 'sticker' ? item.sticker.url : item.phase === 'complete' ? item.url : undefined;
      if (!url || !isSafeTopicImageUrl(url)) return [];
      return [`<p><img src="${escapeTopicHtml(url)}" alt="${escapeTopicHtml(item.kind === 'sticker' ? item.sticker.name : '图片')}" /></p>`];
    });
    return body + images.join('') + FROM_MINI;
  };

  const validateForm = (snapshot = bodySnapshot.current): string | null => {
    if (snapshot.markdown.length > 50000) { Taro.showToast({ title: '正文不能超过50000字', icon: 'none' }); return null; }
    const serialized = snapshot.document ? serializeTopicDocumentHtml(snapshot.document.delta, { attachments, username: getCachedUsername() }) : undefined;
    const source = serialized ? undefined : topicMarkdownToSafeHtml(snapshot.markdown);
    const bodyHtml = serialized?.html ?? source!.html;
    const referencedIds = referencedAttachmentIds(snapshot, serialized?.referencedAttachmentIds);
    const candidates = attachments.filter(item => !item.richManaged || referencedIds.includes(item.id));
    if (snapshot.errors.length || snapshot.unsupported.length || serialized?.errors.length || serialized?.unsupported.length) {
      Taro.showToast({ title: '正文格式或图片状态异常，请修正后再预览', icon: 'none' }); return null;
    }
    if (!getCachedUsername()) {
      openLoginModal();
      return null;
    }
    const resolvedNode = nodeLocked ? currentDef.node : selectedNodeSlug;
    if (!resolvedNode) {
      Taro.showToast({ title: "请选择板块", icon: "none" });
      return null;
    }
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return null;
    }
    if (candidates.some(item => item.kind === 'photo' && item.owner !== getCachedUsername())) {
      Taro.showToast({ title: '图片所属账号已变化，请移除后重新上传', icon: 'none' });
      return null;
    }
    if (candidates.some(item => item.kind === 'photo' && (item.phase !== 'complete' || !item.url))) {
      Taro.showToast({ title: '请等待图片上传完成，失败图片可点击重试', icon: 'none' });
      return null;
    }
    // Validate authored content before metadata/footer makes an empty document look nonempty.
    const meaningfulBody = /<img\s/i.test(bodyHtml) || bodyHtml.replace(/<[^>]*>/g, '').replace(/&(?:nbsp|#160);/g, ' ').trim();
    const legacyImages = candidates.some(item => !item.richManaged && (item.kind === 'sticker' || item.phase === 'complete'));
    if (!meaningfulBody && !legacyImages && topicType !== 'repost') {
      Taro.showToast({ title: "请输入内容", icon: "none" });
      return null;
    }
    const typeError = currentDef.validate(typeFields);
    if (typeError) {
      Taro.showToast({ title: typeError, icon: "none" });
      return null;
    }
    return buildContent(bodyHtml, referencedIds).trim();
  };

  const handleSubmit = async () => {
    if (submitting || submitLock.current || snapshotLock.current) return;
    snapshotLock.current = true;
    try {
      const snapshot = await snapshotBody();
      const finalContent = validateForm(snapshot);
      if (finalContent && active.current) {
        previewContext.current = { title: title.trim(), node: resolvedNodeSlug, owner: getCachedUsername(), boundary: snapshotBoundary.current };
        setPreviewContent(finalContent);
      }
    } catch { if (active.current) Taro.showToast({ title: '正文读取失败，请点击正文后重试', icon: 'none' }); }
    finally { snapshotLock.current = false; }
  };

  const closePreview = () => {
    setPreviewClosing(true);
    setTimeout(() => {
      setPreviewContent(null);
      setPreviewClosing(false);
    }, 250);
  };

  const confirmSubmit = async () => {
    if (submitting || submitLock.current || snapshotLock.current) return;
    const finalContent = previewContent;
    if (!finalContent) return;
    const docResult = bodySnapshot.current.document ? serializeTopicDocumentHtml(bodySnapshot.current.document.delta, { attachments, username: getCachedUsername() }) : undefined;
    const referencedIds = referencedAttachmentIds(bodySnapshot.current, docResult?.referencedAttachmentIds);
    const preview = previewContext.current;
    if (!active.current || !preview || preview.boundary !== snapshotBoundary.current || preview.owner !== getCachedUsername() || !getCachedUsername() || docResult?.errors.length || docResult?.unsupported.length || attachments.some(item => (!item.richManaged || referencedIds.includes(item.id)) && item.kind === 'photo' && (item.owner !== getCachedUsername() || item.phase !== 'complete' || !item.url))) {
      Taro.showToast({ title: '登录或图片状态已变化，请重新预览', icon: 'none' });
      closePreview();
      return;
    }
    setPreviewContent(null);
    setSubmitting(true);
    submitLock.current = true;
    Taro.showLoading({ title: "发布中...", mask: true });
    try {
      await createTopic({
        node: preview.node,
        title: preview.title,
        content: finalContent,
      });
      published.current = true;
      Taro.hideLoading();
      if (!active.current) return;
      const draftKey = getDraftKey(topicType, resolvedNodeSlug || "water");
      cacheService.remove(draftKey);
      cacheService.remove(LAST_DRAFT_KEY);
      setAttachmentDrafts(prev => ({ ...prev, [attachmentDraftKey]: [] }));
      Taro.eventCenter.trigger("refreshTopics");
      Taro.navigateBack();
    } catch {
      Taro.hideLoading();
      if (active.current) Taro.showToast({ title: "发布失败", icon: "none" });
    } finally {
      if (active.current) setSubmitting(false);
      submitLock.current = false;
    }
  };

  return (
    <View className={`createTopic${skyline ? " createTopic--skyline" : ""}`}>
      <Navbar title="发帖" back home titleStyle={{ opacity: 1 }} />
      <ScrollView type={getScrollViewType()} scrollY style={skyline ? undefined : { height: bodyHeight }} className="createTopicBody" enhanced showScrollbar={false}>
        <View className="section typeSection">
        <Text className="typeLabel">发布类型</Text>
        <View className="typeRow">
          {ALL_TYPES.map((t) => (
            <View
              key={t.key}
              className={`typeTag ${topicType === t.key ? "typeTag--active" : ""}`}
              onClick={() => handleTopicTypeChange(t.key as TopicType)}
            >
              <Text className="typeTagText">{t.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="section nodeSection">
        <View className="pickerItem" onClick={openNodePicker}>
          <Text className="pickerLabel">发布到</Text>
          <Text className={`pickerValue ${nodeLocked ? "pickerValue--locked" : ""}`} {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>
            {resolvedNodeName}
          </Text>
          {!nodeLocked && <Text className="arrow">▼</Text>}
        </View>
      </View>

      {currentDef.renderForm({
        fields: typeFields,
        setField,
        title,
        setTitle,
        content,
        setContent: updateBody,
        getRef,
        focusRef,
        handleTitleInput,
        renderContentInput: (placeholder, previousRef) => <TopicEditor
          key={`${attachmentDraftKey}:${editorRevision}`} inputRef={getRef('content')} previousRef={previousRef}
          placeholder={placeholder} value={content} document={document} onChange={updateBody} disabled={submitting || !!previewContent}
          attachments={attachments} onAttachmentsChange={update => setAttachmentDrafts(prev => ({
            ...prev, [attachmentDraftKey]: update(prev[attachmentDraftKey] ?? []),
          }))}
        />,
      })}

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

      {previewContent && (
        <View className={`repostMask${previewClosing ? " repostMask--closing" : ""}`} onClick={closePreview}>
          <View className={`repostSheet${previewClosing ? " repostSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <View className="repostSheetHeader">
              <Text className="repostSheetTitle">预览</Text>
              <View className="repostSheetClose" onClick={closePreview}>
                <Text className="repostSheetCloseText">✕</Text>
              </View>
            </View>
            <ScrollView type={getScrollViewType()} scrollY className="repostSheetScroll" style={skyline ? undefined : { height: "calc(80vh - 200rpx - env(safe-area-inset-bottom))" }}>
              <View className="previewContentWrap">
                <Text className="previewContentTitle">{title.trim()}</Text>
                <HtmlRender html={previewContent} />
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

      <NodePicker
        visible={showNodePicker}
        groups={filteredGroups}
        selectedSlug={selectedNodeSlug}
        onSelect={selectNode}
        onClose={closeNodePicker}
      />
    </View>
  );
}
