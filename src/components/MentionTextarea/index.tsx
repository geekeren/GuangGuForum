import { View, Text, Textarea } from "@tarojs/components";
import { ComponentProps, useRef, useState } from "react";
import { parseMentionDraft, serializeMentionDraft, updateMentionDraft } from "../../utils/mentions";
import type { MentionDraft } from "../../utils/mentions";
import { isSkyline } from "../../utils/renderer";
import "./index.scss";

type Props = ComponentProps<typeof Textarea>;

export default function MentionTextarea({ value = "", onInput, onBlur, className, style, ...props }: Props) {
  const draftRef = useRef<MentionDraft>(parseMentionDraft(value, true));
  const lastValue = useRef(value);
  const [, render] = useState(0);
  if (value !== lastValue.current) {
    draftRef.current = parseMentionDraft(value, true);
    lastValue.current = value;
  }
  const draft = draftRef.current;

  const emit = (next: MentionDraft, event?: Parameters<NonNullable<Props["onInput"]>>[0]) => {
    draftRef.current = next;
    const serialized = serializeMentionDraft(next);
    lastValue.current = serialized;
    render((count) => count + 1);
    const inputEvent = event
      ? { ...event, detail: { ...event.detail, value: serialized } }
      : { detail: { value: serialized, cursor: serialized.length } };
    onInput?.(inputEvent as Parameters<NonNullable<Props["onInput"]>>[0]);
  };

  return (
    <View className={`mentionEditor${isSkyline() ? " mentionEditor--skyline" : ""} ${className || ""}`} style={style}>
      {draft.mentions.length > 0 && (
        <View className='mentionEditorTags'>
          {draft.mentions.map((username) => (
            <View key={username} className='mentionEditorTag' onClick={(event) => {
              event.stopPropagation();
              emit({ ...draftRef.current, mentions: draftRef.current.mentions.filter((name) => name !== username) });
            }}
            >
              <Text>@{username}</Text>
              <Text className='mentionEditorRemove'>×</Text>
            </View>
          ))}
        </View>
      )}
      <Textarea
        {...props}
        className='mentionEditorInput'
        value={draft.text}
        onInput={(event) => {
          const next = updateMentionDraft(draftRef.current, event.detail.value);
          if (!event.detail.value && !draftRef.current.text && draftRef.current.mentions.length) {
            next.mentions = next.mentions.slice(0, -1);
          }
          emit(next, event);
        }}
        onBlur={(event) => {
          const next = updateMentionDraft(draftRef.current, event.detail.value, true);
          emit(next);
          onBlur?.(event);
        }}
      />
    </View>
  );
}
