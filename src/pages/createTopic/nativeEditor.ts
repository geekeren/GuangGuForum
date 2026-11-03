import type Taro from '@tarojs/taro';
import { normalizeTopicDelta, type TopicDelta } from '../../utils/topicDocument';
import type { EditorRange, ShortcutPlan } from './editorShortcuts';

type Callback<T = unknown> = { success?: (result: T) => void; fail?: (error: unknown) => void };
export type NativeEditorContext = Taro.EditorContext & {
  getSelection?: (options: Callback<{ range?: EditorRange | null }>) => void;
  setSelection?: (options: EditorRange & Callback) => void;
  deleteText?: (options: EditorRange & Callback) => void;
};

/** A missing native callback must not permanently lock the mutation/read queue. */
function call<T>(invoke: (options: Callback<T>) => void, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => { if (settled) return; settled = true; clearTimeout(timer); callback(); };
    const timer = setTimeout(() => finish(() => reject(new Error('Native editor timed out'))), timeout);
    try { invoke({ success: result => finish(() => resolve(result)), fail: error => finish(() => reject(error)) }); }
    catch (error) { finish(() => reject(error)); }
  });
}

/** Serialize native mutations and reads. Reads remain available while the page is disabled. */
export function createNativeEditorAdapter(context: NativeEditorContext, current: () => boolean, timeout = 8000) {
  let queue = Promise.resolve();
  let disposed = false;
  let busy = false;
  const valid = () => !disposed && current();
  const assertCurrent = () => { if (!valid()) throw new Error('Editor disposed or replaced'); };
  const invoke = <T>(fn: (options: Callback<T>) => void) => call(fn, timeout);
  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const task = queue.then(async () => {
      assertCurrent(); busy = true;
      try { const result = await job(); assertCurrent(); return result; }
      finally { busy = false; }
    });
    queue = task.then(() => undefined, () => undefined);
    return task;
  };
  return {
    get busy() { return busy; },
    get supportsRanges() { return !!context.getSelection && !!context.setSelection && !!context.deleteText; },
    dispose() { disposed = true; },
    async selection(): Promise<EditorRange | null> {
      if (!context.getSelection || !valid()) return null;
      const result = await invoke<{ range?: EditorRange | null }>(callbacks => context.getSelection!(callbacks));
      const range = result.range;
      return valid() && range && Number.isSafeInteger(range.index) && range.index >= 0
        && Number.isSafeInteger(range.length) && range.length >= 0 ? range : null;
    },
    snapshot() { return enqueue(async () => {
      const result = await invoke<unknown>(callbacks => context.getContents(callbacks));
      if (!result || typeof result !== 'object' || !('delta' in result)) throw new Error('Invalid editor snapshot');
      const delta = result.delta;
      if (!delta || typeof delta !== 'object' || !Array.isArray((delta as { ops?: unknown }).ops)) throw new Error('Invalid editor snapshot');
      return normalizeTopicDelta(delta);
    }); },
    hydrate(delta: TopicDelta) { return enqueue(() => invoke(callbacks => context.setContents({ delta, ...callbacks }))); },
    // Native format is void: the following snapshot/status event is the only observable result.
    format(name: string, value?: string) { return enqueue(async () => { context.format(name, value); }); },
    insertText(text: string) { return enqueue(() => invoke(callbacks => context.insertText({ text, ...callbacks }))); },
    insertImage(src: string, id: string, alt: string) {
      return enqueue(() => invoke(callbacks => context.insertImage({ src, alt, nowrap: true, data: { attachmentId: id }, ...callbacks })));
    },
    shortcut(plan: ShortcutPlan, revision: () => boolean) {
      return enqueue(async () => {
        const guard = () => { assertCurrent(); if (!revision()) throw new Error('Editor changed during shortcut'); };
        if (!context.setSelection || !context.deleteText) throw new Error('Native ranges unavailable');
        guard();
        for (const deletion of plan.deletions) {
          guard(); await invoke(callbacks => context.deleteText!({ ...deletion, ...callbacks }));
        }
        guard(); await invoke(callbacks => context.setSelection!({ ...plan.selection, ...callbacks }));
        guard(); context.format(plan.format.name, plan.format.value);
        await invoke(callbacks => context.setSelection!({ index: plan.caret, length: 0, ...callbacks }));
        guard();
        // Do not blindly toggle bold again: setSelection/status controls caret inheritance.
        return true;
      });
    },
  };
}
export type NativeEditorAdapter = ReturnType<typeof createNativeEditorAdapter>;
