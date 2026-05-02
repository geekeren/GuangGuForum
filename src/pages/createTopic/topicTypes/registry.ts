import type { ReactNode, RefObject } from "react";

export interface TopicTypeDefinition {
  key: string;
  label: string;
  node: string | null;
  hiddenNodes?: string[];

  initialFields: Record<string, any>;

  buildContent(fields: Record<string, any>, shared: {
    title: string;
    content: string;
    fromMini: string;
  }): string;

  validate(fields: Record<string, any>): string | null;

  renderForm(ctx: RenderFormContext): ReactNode;

  onActivate?: (ctx: OnActivateContext) => RefObject<any> | void;
}

export interface RenderFormContext {
  fields: Record<string, any>;
  setField: (key: string, value: any) => void;
  title: string;
  setTitle: (v: string) => void;
  content: string;
  setContent: (v: string) => void;
  getRef: (key: string) => RefObject<any>;
  focusRef: (ref: RefObject<any>) => void;
  handleTitleInput: (val: string) => void;
}

export interface OnActivateContext {
  fields: Record<string, any>;
  setField: (key: string, value: any) => void;
  getRef: (key: string) => RefObject<any>;
}

import normalDef from "./normal";
import repostDef from "./repost";
import eventDef from "./event";
import datingDef from "./dating";

export type TopicType = "normal" | "repost" | "event" | "dating";

const _registry: Record<TopicType, TopicTypeDefinition> = {
  normal: normalDef,
  repost: repostDef,
  event: eventDef,
  dating: datingDef,
};

export const TOPIC_TYPE_REGISTRY = _registry;

export const ALL_TYPES = Object.values(_registry);

export const ALL_HIDDEN_NODES = [...new Set(
  ALL_TYPES.flatMap((t) => t.hiddenNodes ?? [])
)];
