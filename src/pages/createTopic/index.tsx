import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import type { NodeGroup } from "guanggu-forum-api";
import {
  TopicTypeNormal as NormalTypeIcon, TopicTypeRepost as RepostTypeIcon,
  TopicTypeEvent as EventTypeIcon, Heart as DatingTypeIcon,
  TopicPublishNode as PublishNodeIcon, TopicPreview as PreviewIcon,
  ChevronRight as ArrowIcon, Send as SendIcon,
} from "gzk-ui/icons";
import { usePageScope, usePageOwner, usePageRouter } from "../../hooks/usePageScope";
import DesktopLayout from "../../components/DesktopLayout";
import { useViewport } from "../../hooks/useViewport";
import { usePageRenderer } from "../../hooks/usePageRenderer";
import { getCachedNodeNavigation, fetchAndCacheNodeNavigation } from "../../utils/nodeNavigation";
import { getCachedUsername } from "../../utils/currentUser";
import { openLoginModal } from "../../utils/auth";
import type { TopicDocument } from '../../utils/topicDocument';
import Navbar from "../../components/Navbar";
import HtmlRender from "../../components/HtmlRender";
import NodePicker from "../../components/NodePicker";
import ThemedIcon from '../../components/ThemedIcon';
import { TOPIC_TYPE_REGISTRY, ALL_TYPES, ALL_HIDDEN_NODES } from "./topicTypes/registry";
import type { TopicType } from "./topicTypes/registry";
import TopicEditor, { restoreTopicAttachments, type TopicAttachment } from './TopicEditor';
import {
  getDraftKey, hasDraftContent, readTopicDraft, readLastDraftLocation, readLastSelectedNode,
  saveTopicDraft, removeTopicDraft, rememberDraftLocation, rememberSelectedNode,
} from './topicDrafts';
import { useTopicPublishing } from './useTopicPublishing';
import "./index.scss";

const TYPE_ICONS: Record<TopicType, string> = { normal: NormalTypeIcon, repost: RepostTypeIcon, event: EventTypeIcon, dating: DatingTypeIcon };

export default function CreateTopic() {
  const owner = usePageOwner();
  const skyline = usePageRenderer() === "skyline";
  const { isDesktop: pageIsWide } = useViewport();
  const { viewport: pageViewport } = usePageScope();
  const isDesktop = pageIsWide && !pageViewport.isWindowsClient;
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [selectedNodeSlug, setSelectedNodeSlug] = useState("water");
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topicType, setTopicType] = useState<TopicType>("normal");
  const [typeFields, setTypeFields] = useState<Record<string, any>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, TopicAttachment[]>>({});
  const [editorRevision, setEditorRevision] = useState(0);
  const [document, setDocument] = useState<TopicDocument | undefined>(undefined);
  const refMap = useRef<Record<string, any>>({});
  const getRef = (key: string) => {
    if (!refMap.current[key]) {
      refMap.current[key] = { current: null };
    }
    return refMap.current[key];
  };

  const focusRef = (r: any) => r?.current?.focus?.();
  const updateBody = (markdown: string, nextDocument?: TopicDocument) => {
    publishing.setBodySnapshot({ markdown, document: nextDocument, errors: [], unsupported: [] });
    setContent(markdown); setDocument(nextDocument);
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

  const publishing = useTopicPublishing({
    title, node: resolvedNodeSlug, nodeName: resolvedNodeName, topicType, definition: currentDef,
    typeFields, attachments, draftKey: attachmentDraftKey,
    readSnapshot: () => getRef('content').current?.snapshot?.(),
    onSnapshot: snapshot => { setContent(snapshot.markdown); setDocument(snapshot.document); },
    dismissTools: () => getRef('content').current?.dismissTools?.(),
    onPublished: draftKey => {
      removeTopicDraft(draftKey);
      setAttachmentDrafts(prev => ({ ...prev, [draftKey]: [] }));
    },
  });
  const { submitting, previewContent, previewClosing, previewContext, handleSubmit, closePreview, confirmSubmit } = publishing;

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
      else updateBody(restContent + (publishing.getBodySnapshot().markdown ? "\n" + publishing.getBodySnapshot().markdown : ""));
      setTimeout(() => {
        const contentRef = getRef("content");
        contentRef?.current?.focus?.();
      }, 50);
    } else {
      setTitle(val);
    }
  };

  // Node navigation
  const restoreNodeSelection = (groups: NodeGroup[], preferSlug?: string) => {
    const target = preferSlug || readLastSelectedNode() || "water";
    const exists = groups.some((g) => g.nodes.some((n) => n.slug === target));
    setSelectedNodeSlug(!groups.length || exists ? target : "water");
  };

  const router = usePageRouter();
  const nodeSlug = router.params.node;

  useEffect(function loadNodeNavigation() {
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
    const loginTimer = !getCachedUsername() ? setTimeout(() => openLoginModal(undefined, owner), 500) : undefined;
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
  useEffect(function restoreDraft() {
    const { topicType: draftType, nodeSlug: draftNode } = readLastDraftLocation();
    const draftKey = getDraftKey(draftType, draftNode);
    const d = readTopicDraft(draftKey);
    if (d) {
      setTopicType(draftType);
      if (draftType === "normal") setSelectedNodeSlug(draftNode);
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
      const saved = readTopicDraft(attachmentDraftKey);
      return { ...prev, [attachmentDraftKey]: restoreTopicAttachments(saved?.attachments) };
    });
  }, [draftRestored, attachmentDraftKey]);

  // Auto-save draft — isolated by type + node
  useEffect(function autoSaveDraft() {
    if (!draftRestored) return;
    if (!hasDraftContent(title, content, typeFields) && !attachments.length) return;
    const boundary = publishing.getBoundary();
    const timer = setTimeout(() => {
      if (!publishing.canSaveDraft(boundary)) return;
      const snapshot = publishing.getBodySnapshot();
      saveTopicDraft({ topicType, nodeSlug: resolvedNodeSlug || "water", title,
        content: snapshot.markdown, document: snapshot.document, typeFields, attachments });
    }, 800);
    return () => clearTimeout(timer);
  }, [draftRestored, topicType, title, content, document, resolvedNodeSlug, typeFields, attachments]);

  const saveOnLeave = () => {
    if (!publishing.canSaveDraft() || !draftRestored || (!hasDraftContent(title, content, typeFields) && !attachments.length)) return;
    const boundary = publishing.getBoundary();
    const persist = (result = publishing.getBodySnapshot()) => {
      if (!publishing.canSaveDraft(boundary)) return;
      saveTopicDraft({ topicType, nodeSlug: resolvedNodeSlug || 'water', title,
        content: result.markdown, document: result.document, typeFields, attachments });
    };
    persist(); // Retain the latest event snapshot even if native unload cannot complete an async read.
    void getRef('content').current?.snapshot?.().then(result => persist(result)).catch(() => {});
  };
  Taro.useDidHide(saveOnLeave);
  Taro.useUnload(saveOnLeave);

  const clearForm = () => {
    if (publishing.isBusy()) return;
    setTitle("");
    publishing.invalidateBody();
    updateBody('');
    setTypeFields(currentDef.initialFields);
    setAttachmentDrafts(prev => ({ ...prev, [attachmentDraftKey]: [] }));
    setEditorRevision(prev => prev + 1);
    removeTopicDraft(attachmentDraftKey);
  };

  const openNodePicker = () => {
    if (nodeLocked) return;
    setShowNodePicker(true);
  };

  const closeNodePicker = () => setShowNodePicker(false);

  const selectNode = async (slug: string) => publishing.withSnapshot(() => {
    saveOnLeave(); publishing.invalidateBody();
    setSelectedNodeSlug(slug);
    rememberSelectedNode(slug);
    closeNodePicker();
  });

  const handleTopicTypeChange = async (type: TopicType) => {
    if (type === topicType) return;
    await publishing.withSnapshot(() => {
      publishing.invalidateBody();
      // Save current draft before switching
      const currentDraftKey = getDraftKey(topicType, resolvedNodeSlug || "water");
      if (hasDraftContent(title, content, typeFields) || attachments.length) {
        const snapshot = publishing.getBodySnapshot();
        saveTopicDraft({ topicType, nodeSlug: resolvedNodeSlug || "water", title,
          content: snapshot.markdown, document: snapshot.document, typeFields, attachments }, false);
      } else {
        removeTopicDraft(currentDraftKey, false);
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
      const d = readTopicDraft(newDraftKey);
      if (d) {
        newTitle = d.title || "";
        newContent = d.content || "";
        newFields = d.typeFields || def.initialFields;
      }

      // Remember the active type immediately, even before its first edit.
      rememberDraftLocation({ topicType: type, nodeSlug: newNodeSlug || "water" });

      // Update all state at once (batched)
      setTopicType(type);
      setTitle(newTitle);
      updateBody(newContent, d?.document);
      setTypeFields(newFields);

      // Call onActivate with the new fields
      const result = def.onActivate?.({ fields: newFields, setField, getRef });
      const contentRef = getRef("content");
      nextFocusRef.current = result?.current ?? contentRef.current;
    });
  };

  const nextFocusRef = useRef<any>(null);

  const previewPanel = previewContent ? (
        <View className={`topicPreviewMask${isDesktop ? " topicPreviewMask--desktop" : ""}${previewClosing ? " topicPreviewMask--closing" : ""}`} onClick={closePreview}>
          <View className={`topicPreviewSheet${previewClosing ? " topicPreviewSheet--closing" : ""}`} onClick={(e) => e.stopPropagation()}>
            <View className='topicPreviewHandle' />
            <View className='topicPreviewHeader'>
              <Text className='topicPreviewHeading'>帖子预览</Text>
              <View className='topicPreviewClose' ariaRole='button' ariaLabel='关闭预览' onClick={closePreview}>
                <Text>×</Text>
              </View>
            </View>
            <ScrollView type={skyline ? 'custom' : undefined} scrollY className='topicPreviewScroll' enhanced showScrollbar={false}>
              <View className='topicPreviewCard'>
                <View className='topicPreviewNode'><ThemedIcon src={PublishNodeIcon} tone='accent' className='topicPreviewNodeIcon' /><Text>{previewContext?.nodeName}</Text></View>
                <Text className='topicPreviewTitle'>{previewContext?.title}</Text>
                <View className='topicBodyImageViewport'><HtmlRender html={previewContent} variant='body' /></View>
              </View>
            </ScrollView>
            <View className='topicPreviewActions'>
              <View className='topicPreviewCancel' ariaRole='button' onClick={closePreview}>
                <Text>取消</Text>
              </View>
              <View className={`topicPreviewPublish${submitting ? ' topicPreviewPublish--disabled' : ''}`} ariaRole='button' onClick={confirmSubmit}>
                <ThemedIcon src={SendIcon} color='#fff' className='topicPreviewSendIcon' /><Text>{submitting ? '发布中...' : '发布'}</Text>
              </View>
            </View>
          </View>
        </View>
  ) : null;

  return (
    <DesktopLayout title='发帖' variant='compose' back sidebar={<View className='createTopic createTopicPreviewColumn'>
      {previewPanel || <View className='topicDesktopPreviewPlaceholder'><Text className='topicDesktopPreviewPlaceholderTitle'>帖子预览</Text><Text>点击「预览」后，在这里核对帖子内容，再确认发布。</Text></View>}
    </View>}
    >
    <View className={`createTopic${skyline ? " createTopic--skyline" : ""}${isDesktop ? " createTopic--desktop" : ""}`}>
      {!isDesktop && <Navbar title='发帖' back home titleStyle={{ opacity: 1 }} />}
      <ScrollView type={skyline ? 'custom' : undefined} scrollY className='createTopicBody' enhanced showScrollbar={false}>
        <View className='section typeConfig'>
          <View className='typeSection'>
            <View className='typeRow'>
              {ALL_TYPES.map((t) => (
                <View
                  key={t.key}
                  className={`typeTag ${topicType === t.key ? "typeTag--active" : ""}`}
                  onClick={() => handleTopicTypeChange(t.key as TopicType)}
                >
                  <ThemedIcon src={TYPE_ICONS[t.key as TopicType]} color={topicType === t.key ? '#fff' : undefined} tone='secondary' className='typeTagIcon' />
                  <Text className='typeTagText'>{t.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
          <View className='section nodeSection'>
            <View className='pickerItem' onClick={openNodePicker}>
              <ThemedIcon src={PublishNodeIcon} tone='accent' className='publishNodeIcon' />
              <Text className='pickerLabel'>发布到</Text>
              <Text className={`pickerValue ${nodeLocked ? "pickerValue--locked" : ""}`} {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>
                {resolvedNodeName}
              </Text>
              {!nodeLocked && <ThemedIcon src={ArrowIcon} tone='secondary' className='publishNodeArrow' />}
            </View>
            <View className={`previewBtn${submitting ? ' previewBtn--disabled' : ''}`} ariaRole='button' ariaLabel='预览帖子' onClick={handleSubmit}>
              <ThemedIcon src={PreviewIcon} tone='accent' className='previewBtnIcon' /><Text className='previewBtnText'>{submitting ? '发布中...' : '预览'}</Text>
            </View>
          </View>

      {currentDef.renderForm({
        renderer: skyline ? "skyline" : "webview",
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
          placeholder={placeholder} value={content} document={document} onChange={updateBody} disabled={submitting || !!previewContent} desktop={isDesktop}
          onClear={clearForm}
          attachments={attachments} onAttachmentsChange={update => setAttachmentDrafts(prev => ({
            ...prev, [attachmentDraftKey]: update(prev[attachmentDraftKey] ?? []),
          }))}
        />,
      })}

      </ScrollView>

      {!isDesktop && previewPanel}

      <NodePicker
        desktop={isDesktop}
        visible={showNodePicker}
        groups={filteredGroups}
        selectedSlug={selectedNodeSlug}
        onSelect={selectNode}
        onClose={closeNodePicker}
      />
    </View>
    </DesktopLayout>
  );
}
