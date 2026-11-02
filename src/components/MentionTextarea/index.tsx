import { View, Text, Textarea } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ComponentProps, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AI_MENTION_USERNAME, getMentionSegments, getMentionQuery, getMentionCandidates, replaceInlineMention } from "../../utils/mentions";
import UserAvatar from '../UserAvatar';
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

export interface MentionEditorHandle {
  insertText: (text: string) => void;
  openMentions: () => void;
}

type Props = ComponentProps<typeof Textarea> & {
  mentionUsers?: string[];
  mentionAvatars?: Record<string, string>;
  topicAuthor?: string;
  editorRef?: Ref<MentionEditorHandle>;
};

let nextCandidateViewportId = 0;
type CandidateTouchEvent = { touches?: Array<{ clientX: number }> };
type MentionSelection = { start: number; end: number };
type NativeTextarea = { value: string; setAttribute: (name: string, value: number) => void };

export default function MentionTextarea({ value = "", onInput, onBlur, onSelectionChange, className, style, mentionUsers = [], mentionAvatars = {}, topicAuthor, editorRef, ...props }: Props) {
  const textRef = useRef(value);
  const lastValue = useRef(value);
  const caretRef = useRef({ start: value.length, end: value.length });
  const composingRef = useRef(false);
  const [query, setQuery] = useState<ReturnType<typeof getMentionQuery>>(null);
  const [selection, setSelection] = useState<number | undefined>(undefined);
  const [mentionSelection, setMentionSelection] = useState<MentionSelection | null>(null);
  const pendingMention = useRef<(MentionSelection & { confirmed: boolean }) | null>(null);
  const nativeInput = useRef<NativeTextarea | null>(null);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const viewportId = useRef('');
  if (!viewportId.current) viewportId.current = `mention-candidates-${++nextCandidateViewportId}`;
  const viewportWidth = useRef(0);
  const pan = useRef<{ startX: number; offset: number; moved: boolean } | null>(null);
  const [, render] = useState(0);
  if (value !== lastValue.current) {
    textRef.current = value;
    lastValue.current = value;
    caretRef.current = { start: value.length, end: value.length };
    setQuery(null);
    setSelection(undefined);
    setCandidateOffset(0);
    setMentionSelection(null);
    pendingMention.current = null;
  }
  const text = textRef.current;
  const segments = getMentionSegments(text);
  const recipients = segments.filter((part) => part.username && part.start !== query?.start).map((part) => part.username!);
  const candidates = query ? getMentionCandidates([...mentionUsers, AI_MENTION_USERNAME], recipients, query) : [];
  const windowWidth = Taro.getWindowInfo?.().windowWidth || 375;
  const maxCandidateOffset = Math.max(0, candidates.length * 120 * windowWidth / 750 - (viewportWidth.current || windowWidth));
  const visibleCandidateOffset = Math.max(-maxCandidateOffset, Math.min(0, candidateOffset));
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

  const applyEdit = (next: string, cursor: number) => {
    const maxLength = props.maxlength ?? 140;
    if (props.disabled || (maxLength >= 0 && next.length > maxLength)) return;
    // Update the native value/caret without dismissing and reopening the keyboard.
    setSelection(cursor);
    setMentionSelection(null);
    pendingMention.current = null;
    setCandidateOffset(0);
    setQuery(getMentionQuery(next, cursor));
    emit(next, cursor);
  };

  const selectUser = (username: string) => {
    if (!query || props.disabled || composingRef.current || pan.current?.moved) return;
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
    <View className={`mentionEditor${isSkyline() ? " mentionEditor--skyline" : ""} ${className || ""}`} style={style}>
      <View className={`mentionCandidates${query ? ' mentionCandidates--visible' : ''}`} ariaHidden={!query}>
        {query && <>
          <Text className='mentionCandidatesTitle'>提及用户</Text>
          <View
            id={viewportId.current}
            className='mentionCandidatesList'
            catchMove
            // Consume the gesture ourselves: native ScrollView drags can blur
            // a textarea even with holdKeyboard. Never toggle its focus here.
            onTouchStart={(event) => {
              event.stopPropagation();
              const x = (event as typeof event & CandidateTouchEvent).touches?.[0]?.clientX;
              pan.current = typeof x === 'number' && Number.isFinite(x) ? { startX: x, offset: visibleCandidateOffset, moved: false } : null;
              Taro.createSelectorQuery?.().select(`#${viewportId.current}`).boundingClientRect((rect) => {
                if (rect && !Array.isArray(rect) && rect.width > 0) viewportWidth.current = rect.width;
              }).exec();
            }}
            onTouchMove={(event) => {
              event.stopPropagation();
              const x = (event as typeof event & CandidateTouchEvent).touches?.[0]?.clientX;
              if (!pan.current || typeof x !== 'number' || !Number.isFinite(x) || props.disabled) return;
              const delta = x - pan.current.startX;
              if (Math.abs(delta) > 6) pan.current.moved = true;
              if (!pan.current.moved) return;
              const max = Math.max(0, candidates.length * 120 * windowWidth / 750 - (viewportWidth.current || windowWidth));
              setCandidateOffset(Math.max(-max, Math.min(0, pan.current.offset + delta)));
            }}
            onTouchEnd={(event) => event.stopPropagation()}
            onTouchCancel={(event) => { event.stopPropagation(); pan.current = null; }}
          >
            {candidates.length > 0 && <View className='mentionCandidatesTrack' style={{ width: candidates.length * 120 + 'rpx', transform: `translateX(${visibleCandidateOffset}px)` }}>
              {candidates.map((username) => {
                const avatar = mentionAvatars[username] || '/static/m_default.png';
                return (
                  <View key={username} className='mentionCandidate' ariaRole='button' ariaLabel={`提及${username}`} onClick={() => selectUser(username)}>
                    <UserAvatar username={username} src={avatar} size={54} className='mentionCandidateAvatarWrap' imageClassName='mentionCandidateAvatar' compactAiTag={false}>
                      {username === topicAuthor && <Text className='mentionCandidateBadge mentionCandidateOwnerBadge'>楼主</Text>}
                    </UserAvatar>
                    <Text className='mentionCandidateName' maxLines={2} overflow='ellipsis'>{username}</Text>
                  </View>
                );
              })}
            </View>}
            {!candidates.length && <Text className='mentionCandidatesEmpty'>暂无匹配用户，可直接输入用户名</Text>}
          </View>
        </>}
      </View>
      <View className='mentionEditorSurface' onTouchStart={() => {
        // Release the programmatic caret before native touch selection.
        setSelection(undefined);
        setMentionSelection(null);
        pendingMention.current = null;
      }}>
        <Textarea
          {...props}
          ref={nativeInput}
          className='mentionEditorInput'
          value={text}
          focus={props.focus}
          disableDefaultPadding={props.disableDefaultPadding ?? true}
          cursor={mentionSelection ? -1 : selection ?? props.cursor ?? -1}
          selectionStart={mentionSelection?.start ?? selection ?? props.selectionStart ?? -1}
          selectionEnd={mentionSelection?.end ?? selection ?? props.selectionEnd ?? -1}
          holdKeyboard={props.holdKeyboard ?? true}
          onFocus={(event) => {
            if (selection !== undefined) caretRef.current = { start: selection, end: selection };
            props.onFocus?.(event);
          }}
          onInput={(event) => {
            setCandidateOffset(0);
            const previous = textRef.current;
            const next = event.detail.value;
            if (!composingRef.current && next.length < previous.length) {
              let start = 0;
              while (start < next.length && previous[start] === next[start]) start++;
              let oldEnd = previous.length;
              let newEnd = next.length;
              while (newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
              // Only expand a pure deletion, never an IME replacement or an
              // unfinished @ query. Preserve text on either side of the token.
              if (newEnd === start) {
                const pending = pendingMention.current;
                if (pending && start < pending.end && oldEnd > pending.start) {
                  applyEdit(previous.slice(0, pending.start) + previous.slice(pending.end), pending.start);
                  return;
                }
                const touched = getMentionSegments(previous).filter(part => part.username &&
                  part.start !== query?.start && part.start < oldEnd && part.end > start &&
                  (start > part.start || oldEnd < part.end));
                if (touched.length) {
                  if ([...previous.slice(start, oldEnd)].length === 1) {
                    const range = { start: touched[0].start, end: touched[0].end };
                    pendingMention.current = { ...range, confirmed: false };
                    caretRef.current = range;
                    setSelection(undefined);
                    setMentionSelection(range);
                    setQuery(null);
                    // Native textarea has already removed a character. Explicitly
                    // restore its value even though the React value is unchanged.
                    if (nativeInput.current) {
                      nativeInput.current.value = previous;
                      nativeInput.current.setAttribute('selectionStart', range.start);
                      nativeInput.current.setAttribute('selectionEnd', range.end);
                    }
                    return;
                  }
                  const from = Math.min(start, touched[0].start);
                  const to = Math.max(oldEnd, touched[touched.length - 1].end);
                  applyEdit(previous.slice(0, from) + previous.slice(to), from);
                  return;
                }
              }
            }
            setSelection(undefined);
            setMentionSelection(null);
            pendingMention.current = null;
            const cursor = event.detail.cursor ?? event.detail.value.length;
            const nextQuery = composingRef.current ? null : getMentionQuery(next, cursor);
            const stillCompleted = next.length < previous.length && nextQuery && getMentionSegments(previous).some(part => part.username &&
              part.start === nextQuery.start && part.start !== query?.start &&
              part.text === next.slice(nextQuery.start, nextQuery.end));
            setQuery(stillCompleted ? null : nextQuery);
            emit(event.detail.value, cursor, event);
          }}
          onSelectionChange={(event) => {
            const { selectionStart, selectionEnd } = event.detail;
            const pending = pendingMention.current;
            if (pending) {
              if (selectionStart === pending.start && selectionEnd === pending.end) {
                pending.confirmed = true;
                caretRef.current = { start: selectionStart, end: selectionEnd };
              } else if (pending.confirmed) {
                pendingMention.current = null;
                setMentionSelection(null);
                caretRef.current = { start: selectionStart, end: selectionEnd };
              }
              onSelectionChange?.(event);
              return;
            }
            if (selection !== undefined && selectionStart === selection && selectionEnd === selection) {
              setSelection(undefined);
            }
            if (selection === undefined && Number.isFinite(selectionStart) && Number.isFinite(selectionEnd)) {
              caretRef.current = { start: selectionStart, end: selectionEnd };
              setSelection(undefined);
              setQuery(!composingRef.current && selectionStart === selectionEnd ? getMentionQuery(textRef.current, selectionStart) : null);
            }
            onSelectionChange?.(event);
          }}
          onKeyboardCompositionStart={(event) => {
            composingRef.current = true;
            setQuery(null);
            props.onKeyboardCompositionStart?.(event);
          }}
          onKeyboardCompositionEnd={(event) => {
            composingRef.current = false;
            setQuery(getMentionQuery(textRef.current, caretRef.current.start));
            props.onKeyboardCompositionEnd?.(event);
          }}
          onBlur={(event) => {
            if (selection === undefined && !pendingMention.current && Number.isFinite(event.detail.cursor)) caretRef.current = { start: event.detail.cursor, end: event.detail.cursor };
            // Keep the active query available while a suggestion receives the tap.
            composingRef.current = false;
            onBlur?.(event);
          }}
        />
      </View>

    </View>
  );
}
