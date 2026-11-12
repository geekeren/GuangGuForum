import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { createTopic } from "guanggu-forum-api";
import { usePageOwner, usePageNavigation } from "../../hooks/usePageScope";
import { getCachedUsername } from "../../utils/currentUser";
import { openLoginModal } from "../../utils/auth";
import type { EditorSnapshot } from "./RichTopicBody";
import { canPublishTopicSnapshot, validateTopicContent, type TopicContentInput } from "./topicContent";

type PublishingInput = Omit<TopicContentInput, "username"> & {
  nodeName: string;
  draftKey: string;
  readSnapshot: () => Promise<EditorSnapshot> | undefined;
  onSnapshot: (snapshot: EditorSnapshot) => void;
  dismissTools: () => void;
  onPublished: (draftKey: string) => void;
};
type PreviewContext = {
  title: string; node: string; nodeName: string; owner: string; boundary: number; draftKey: string;
};

/** Owns the native read boundary and preview/publication lifecycle, not form or draft storage. */
export function useTopicPublishing(input: PublishingInput) {
  const pageOwner = usePageOwner();
  const navigation = usePageNavigation();
  const latest = useRef(input); latest.current = input;
  const [submitting, setSubmitting] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const previewHtml = useRef<string | null>(null);
  const previewContext = useRef<PreviewContext | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generation = useRef(0);
  const active = useRef(true);
  const snapshotLock = useRef(false);
  const submitLock = useRef(false);
  const published = useRef(false);
  const boundary = useRef(0);
  const body = useRef<EditorSnapshot>({ markdown: "", errors: [], unsupported: [] });

  useEffect(function trackPublishingLifetime() {
    active.current = true;
    return () => {
      active.current = false;
      boundary.current++;
      generation.current++;
      clearTimeout(closeTimer.current);
    };
  }, []);

  const busy = () => !active.current || published.current || submitLock.current || snapshotLock.current;
  const isBusy = () => busy() || !!previewHtml.current;
  const setBodySnapshot = (snapshot: EditorSnapshot) => { body.current = snapshot; };
  const getBodySnapshot = () => body.current;
  const getBoundary = () => boundary.current;
  const invalidateBody = () => { boundary.current++; };
  const canSaveDraft = (atBoundary = boundary.current) => !published.current && atBoundary === boundary.current;

  const snapshotBody = async () => {
    const atBoundary = boundary.current;
    const pending = latest.current.readSnapshot();
    if (!pending) throw new Error("Editor unavailable");
    const snapshot = await pending;
    if (!active.current || atBoundary !== boundary.current) throw new Error("Editor changed");
    setBodySnapshot(snapshot);
    latest.current.onSnapshot(snapshot);
    return snapshot;
  };

  // Type/node transitions hold the same lock as preview until their state/draft work finishes.
  const withSnapshot = async (action: (snapshot: EditorSnapshot) => void) => {
    if (isBusy()) return;
    snapshotLock.current = true;
    try { action(await snapshotBody()); } catch { /* Retain the current form when native reading fails. */ }
    finally { snapshotLock.current = false; }
  };

  const resetPreview = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    generation.current++;
    setPreviewClosing(false);
  };

  const handleSubmit = async () => {
    if (busy()) return;
    snapshotLock.current = true;
    try {
      const snapshot = await snapshotBody();
      const current = latest.current;
      const owner = getCachedUsername();
      const result = validateTopicContent(snapshot, { ...current, username: owner });
      if (!result.ok) {
        if (result.reason === "login") openLoginModal(undefined, pageOwner);
        else Taro.showToast({ title: result.message, icon: "none" });
        return;
      }
      resetPreview();
      current.dismissTools();
      try { void Taro.hideKeyboard().catch(() => {}); } catch {}
      previewContext.current = {
        title: current.title.trim(), node: current.node, nodeName: current.nodeName,
        owner, boundary: boundary.current, draftKey: current.draftKey,
      };
      previewHtml.current = result.html;
      setPreviewContent(result.html);
    } catch {
      if (active.current) Taro.showToast({ title: "正文读取失败，请点击正文后重试", icon: "none" });
    } finally { snapshotLock.current = false; }
  };

  const closePreview = () => {
    if (!active.current || !previewHtml.current || closeTimer.current !== undefined) return;
    const atGeneration = generation.current;
    setPreviewClosing(true);
    const timer = setTimeout(() => {
      if (closeTimer.current !== timer) return;
      closeTimer.current = undefined;
      if (!active.current || atGeneration !== generation.current) return;
      previewHtml.current = null;
      setPreviewContent(null);
      setPreviewClosing(false);
    }, 250);
    closeTimer.current = timer;
  };

  const confirmSubmit = async () => {
    if (busy()) return;
    const finalContent = previewHtml.current;
    if (!finalContent) return;
    const preview = previewContext.current;
    const current = latest.current;
    const username = getCachedUsername();
    if (!preview || preview.boundary !== boundary.current || preview.owner !== username ||
      !canPublishTopicSnapshot(body.current, { attachments: current.attachments, username })) {
      Taro.showToast({ title: "登录或图片状态已变化，请重新预览", icon: "none" });
      closePreview();
      return;
    }
    resetPreview();
    previewHtml.current = null;
    setPreviewContent(null);
    submitLock.current = true;
    setSubmitting(true);
    Taro.showLoading({ title: "发布中...", mask: true });
    try {
      await createTopic({ node: preview.node, title: preview.title, content: finalContent });
      published.current = true;
      Taro.hideLoading();
      if (!active.current) return;
      current.onPublished(preview.draftKey);
      Taro.eventCenter.trigger("refreshTopics");
      navigation.navigateBack();
    } catch {
      Taro.hideLoading();
      if (active.current) Taro.showToast({ title: "发布失败", icon: "none" });
    } finally {
      if (active.current) setSubmitting(false);
      submitLock.current = false;
    }
  };

  return {
    submitting, previewContent, previewClosing, previewContext: previewContext.current,
    handleSubmit, closePreview, confirmSubmit, withSnapshot, isBusy,
    getBodySnapshot, setBodySnapshot, getBoundary, invalidateBody, canSaveDraft,
  };
}
