import { createRequire } from "node:module";
import type { ReactNode } from "react";

// Use the same installed React reconciler as Taro, without a browser/DOM shim.
const requireProject = createRequire(`${process.cwd()}/package.json`);
type HostNode = { type: string; props?: Record<string, any>; children: HostNode[]; text?: string };
export function createNativeTestRenderer() {
  const remove = (parent: HostNode, child: HostNode) => { parent.children = parent.children.filter(node => node !== child); };
  const append = (parent: HostNode, child: HostNode) => { remove(parent, child); parent.children.push(child); };
  const insert = (parent: HostNode, child: HostNode, before: HostNode) => { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); };
  const renderer = requireProject("react-reconciler")({
    supportsMutation: true, isPrimaryRenderer: true, supportsPersistence: false, supportsHydration: false,
    getRootHostContext: () => ({}), getChildHostContext: (context: unknown) => context,
    getPublicInstance: (instance: HostNode) => instance, prepareForCommit: () => null, resetAfterCommit: () => {},
    createInstance: (type: string, props: Record<string, any>) => ({ type, props, children: [] }),
    createTextInstance: (text: string) => ({ type: "#text", text, children: [] }),
    appendInitialChild: append, appendChild: append, appendChildToContainer: append,
    insertBefore: insert, insertInContainerBefore: insert, removeChild: remove, removeChildFromContainer: remove,
    finalizeInitialChildren: () => false, shouldSetTextContent: () => false, prepareUpdate: () => true,
    commitUpdate: (instance: HostNode, _: unknown, __: string, ___: unknown, props: Record<string, any>) => { instance.props = props; },
    commitTextUpdate: (instance: HostNode, _: string, text: string) => { instance.text = text; },
    clearContainer: (container: HostNode) => { container.children = []; },
    hideInstance: () => {}, unhideInstance: () => {}, hideTextInstance: () => {}, unhideTextInstance: () => {},
    scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
    getCurrentEventPriority: () => 16, supportsMicrotasks: true, scheduleMicrotask: queueMicrotask,
    detachDeletedInstance: () => {},
  });
  const container: HostNode = { type: "root", children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, "", (error: Error) => { throw error; }, null);
  const flush = (callback: () => void) => { renderer.flushSync(callback); renderer.flushPassiveEffects(); };
  return {
    container, flush,
    render(element: ReactNode) { flush(() => renderer.updateContainer(element, root, null)); },
    unmount() { flush(() => renderer.updateContainer(null, root, null)); },
  };
}
