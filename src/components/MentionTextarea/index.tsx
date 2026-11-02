import { View, Text, Textarea, ScrollView } from "@tarojs/components";
import { ComponentProps, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { getMentionSegments, getMentionQuery, getMentionCandidates, replaceInlineMention } from "../../utils/mentions";
import Taro from "@tarojs/taro";
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

export interface MentionEditorHandle {
  insertText: (text: string) => void;
  openMentions: () => void;
}

type Props = ComponentProps<typeof Textarea> & {
  mentionUsers?: string[];
  editorRef?: Ref<MentionEditorHandle>;
  /** Match the visible native textarea height; overflow falls back to native paint. */
  mirrorMaxLines?: number;
};

export default function MentionTextarea({ value = "", onInput, onBlur, onSelectionChange, className, style, mentionUsers = [], editorRef, mirrorMaxLines = 4, ...props }: Props) {
  const textRef = useRef(value);
  const lastValue = useRef(value);
  const caretRef = useRef({ start: value.length, end: value.length });
  const composingRef = useRef(false);
  const [query, setQuery] = useState<ReturnType<typeof getMentionQuery>>(null);
  const [restoreFocus, setRestoreFocus] = useState<boolean | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState(0);
  const [selection, setSelection] = useState<number | undefined>(undefined);
  const [selecting, setSelecting] = useState(false);
  const [composing, setComposing] = useState(false);
  const [nativeLines, setNativeLines] = useState(value.split("\n").length);
  const [, render] = useState(0);
  if (value !== lastValue.current) {
    textRef.current = value;
    lastValue.current = value;
    caretRef.current = { start: value.length, end: value.length };
    setQuery(null);
    setSelection(undefined);
    setSelecting(false);
  }
  const text = textRef.current;
  const segments = getMentionSegments(text);
  const recipients = segments.filter((part) => part.username && part.start !== query?.start).map((part) => part.username!);
  const candidates = query ? getMentionCandidates(mentionUsers, recipients, query) : [];
  // Native selection, IME preedit and internal scrolling must never rely on a mirror.
  const mirrored = segments.some((part) => part.username && part.start !== query?.start) &&
    !selecting && !composing && nativeLines <= mirrorMaxLines;

  const emit = (next: string, cursor: number, event?: Parameters<NonNullable<Props["onInput"]>>[0]) => {
    textRef.current = next;
    lastValue.current = next;
    caretRef.current = { start: cursor, end: cursor };
    render((count) => count + 1);
    const inputEvent = event
      ? { ...event, detail: { ...event.detail, value: next, cursor } }
      : { detail: { value: next, cursor } };
    onInput?.(inputEvent as Parameters<NonNullable<Props["onInput"]>>[0]);
  };

  useEffect(() => {
    if (!focusRequest) return;
    let active = true;
    // Native cursor/selection properties are applied on focus, after the new value.
    Taro.nextTick(() => { if (active) setRestoreFocus(true); });
    return () => { active = false; };
  }, [focusRequest]);

  const applyEdit = (next: string, cursor: number) => {
    const maxLength = props.maxlength ?? 140;
    if (props.disabled || (maxLength >= 0 && next.length > maxLength)) return;
    setRestoreFocus(false);
    setFocusRequest((request) => request + 1);
    setSelection(cursor);
    setSelecting(false);
    setQuery(getMentionQuery(next, cursor));
    emit(next, cursor);
  };

  const selectUser = (username: string) => {
    if (!query || props.disabled || composingRef.current) return;
    const next = replaceInlineMention(textRef.current, query, username);
    applyEdit(next.value, next.cursor);
  };

  const insertText = (inserted: string) => {
    if (props.disabled || composingRef.current) return;
    const current = textRef.current;
    const start = Math.max(0, Math.min(caretRef.current.start, current.length));
    const end = Math.max(start, Math.min(caretRef.current.end, current.length));
    applyEdit(current.slice(0, start) + inserted + current.slice(end), start + inserted.length);
  };

  useImperativeHandle(editorRef, () => ({
    insertText,
    openMentions: () => {
      if (props.disabled || composingRef.current) return;
      const current = textRef.current;
      const active = getMentionQuery(current, caretRef.current.start);
      if (active && caretRef.current.start === caretRef.current.end) { setQuery(active); return; }
      const before = current.slice(0, caretRef.current.start);
      insertText(before && !/\s$/.test(before) ? " @" : "@");
    },
  }));

  return (
    <View className={`mentionEditor${mirrored ? " mentionEditor--mirrored" : ""}${isSkyline() ? " mentionEditor--skyline" : ""} ${className || ""}`} style={style}>
      <View className='mentionEditorSurface' onTouchStart={() => {
        // Some clients delay selectionchange until the long-press gesture completes.
        setSelecting(true);
        setSelection(undefined);
      }}>
        {mirrored && (
          <View className='mentionEditorMirror' ariaRole='presentation'>
            <Text className='mentionEditorMirrorText'>
              {segments.map((part) => <Text key={part.start} className={part.username && part.start !== query?.start ? 'mentionEditorInlineMention' : undefined}>{part.text}</Text>)}
            </Text>
          </View>
        )}
        <Textarea
          {...props}
          className='mentionEditorInput'
          value={text}
          focus={restoreFocus ?? props.focus}
          disableDefaultPadding={props.disableDefaultPadding ?? true}
          cursor={selection ?? props.cursor}
          selectionStart={selection ?? props.selectionStart}
          selectionEnd={selection ?? props.selectionEnd}
          holdKeyboard
          onFocus={(event) => {
            if (selection !== undefined) caretRef.current = { start: selection, end: selection };
            props.onFocus?.(event);
          }}
          onInput={(event) => {
            setSelection(undefined);
            setSelecting(false);
            const cursor = event.detail.cursor ?? event.detail.value.length;
            setQuery(composingRef.current ? null : getMentionQuery(event.detail.value, cursor));
            emit(event.detail.value, cursor, event);
          }}
          onSelectionChange={(event) => {
            const { selectionStart, selectionEnd } = event.detail;
            if (restoreFocus !== false && Number.isFinite(selectionStart) && Number.isFinite(selectionEnd)) {
              caretRef.current = { start: selectionStart, end: selectionEnd };
              setSelection(undefined);
              setSelecting(selectionStart !== selectionEnd);
              setQuery(!composingRef.current && selectionStart === selectionEnd ? getMentionQuery(textRef.current, selectionStart) : null);
            }
            onSelectionChange?.(event);
          }}
          onLineChange={(event) => {
            if (Number.isFinite(event.detail.lineCount)) setNativeLines(event.detail.lineCount);
            props.onLineChange?.(event);
          }}
          onKeyboardCompositionStart={(event) => {
            composingRef.current = true;
            setComposing(true);
            setQuery(null);
            props.onKeyboardCompositionStart?.(event);
          }}
          onKeyboardCompositionEnd={(event) => {
            composingRef.current = false;
            setComposing(false);
            setQuery(getMentionQuery(textRef.current, caretRef.current.start));
            props.onKeyboardCompositionEnd?.(event);
          }}
          onBlur={(event) => {
            if (restoreFocus !== false && Number.isFinite(event.detail.cursor)) caretRef.current = { start: event.detail.cursor, end: event.detail.cursor };
            // Keep the active query available while a suggestion receives the tap.
            composingRef.current = false;
            setComposing(false);
            setSelecting(false);
            onBlur?.(event);
          }}
        />
      </View>
      {query && (
        <View className='mentionCandidates'>
          <Text className='mentionCandidatesTitle'>提及帖子中的用户</Text>
          <ScrollView scrollY className='mentionCandidatesList'>
            {candidates.map((username) => (
              <View key={username} className='mentionCandidate' onClick={() => selectUser(username)}>
                <Text className='mentionCandidateAt'>@</Text>
                <Text className='mentionCandidateName'>{username}</Text>
              </View>
            ))}
            {!candidates.length && <Text className='mentionCandidatesEmpty'>暂无匹配用户，可直接输入用户名</Text>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
