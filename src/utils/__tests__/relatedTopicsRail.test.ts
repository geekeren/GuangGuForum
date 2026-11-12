import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Taro from '@tarojs/taro';
import { useRelatedTopicsRail } from '../../pages/topicDetail/useRelatedTopicsRail';
import RelatingTopics from '../../pages/topicDetail/relatingTopics';

vi.mock('@tarojs/components', () => ({ ScrollView: 'ScrollView', View: 'View', Text: 'Text' }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('guanggu-forum-api', () => ({ URLS: {}, urlPathVaiable: () => () => ({ params: { tid: 'synthetic' } }) }));

const runtime = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], ready: null as any, show: null as any, hide: null as any, resize: null as any, ticks: [] as any[], queries: [] as any[], platform: 'windows', owner: {} as any }));
vi.mock('react', () => ({
  useState: (value: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = typeof value === 'function' ? value() : value; return [runtime.state[i], (next: any) => { runtime.state[i] = typeof next === 'function' ? next(runtime.state[i]) : next; }]; },
  useRef: (value: any) => runtime.refs[runtime.refCursor++] ??= { current: value },
  useEffect: (effect: any) => runtime.effects.push(effect),
  useCallback: (callback: any) => callback,
}));
vi.mock('@tarojs/taro', () => ({ default: {
  getDeviceInfo: () => ({ platform: runtime.platform }), getCurrentInstance: () => ({ page: runtime.owner }),
  nextTick: (callback: any) => runtime.ticks.push(callback),
  createSelectorQuery: vi.fn(() => {
    const record = { owner: null as any, selectors: [] as string[], callback: null as any };
    runtime.queries.push(record);
    const query = { in: (owner: any) => { record.owner = owner; return query; }, select: (selector: string) => { record.selectors.push(selector); return query; }, boundingClientRect: () => query, exec: (callback: any) => { record.callback = callback; } };
    return query;
  }),
}, useReady: (callback: any) => { runtime.ready = callback; }, useDidShow: (callback: any) => { runtime.show = callback; }, useDidHide: (callback: any) => { runtime.hide = callback; }, useResize: (callback: any) => { runtime.resize = callback; } }));
function useRenderRail(hasData = true, pageReady = true) { runtime.cursor = runtime.refCursor = 0; return useRelatedTopicsRail(hasData, pageReady); }
function flush() { runtime.ticks.splice(0).forEach(callback => callback()); }
function response(width = 1200, viewport = { left: 50, top: 80, width: 1200, height: 640 }) {
  return [{ left: 50, top: 20, width, height: 780 }, viewport];
}
beforeEach(() => { runtime.state = []; runtime.refs = []; runtime.effects = []; runtime.ticks = []; runtime.queries = []; runtime.platform = 'windows'; runtime.owner = {}; vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('bounded first-paint geometry gate', () => {
  it('starts cached desktop data synchronously pending, then commits readiness and wide layout together', () => {
    expect(useRenderRail()).toMatchObject({ ready: false, wide: false });
    runtime.effects[0](); flush();
    expect(vi.getTimerCount()).toBe(1);
    runtime.queries[0].callback(response());
    expect(runtime.state[0]).toMatchObject({ ready: true, layout: { rail: { width: '336px' } } });
    expect(useRenderRail()).toMatchObject({ ready: true, wide: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['ios', 'android', 'devtools'])('is synchronously ready inline without timers or queries on %s', platform => {
    runtime.platform = platform;
    expect(useRenderRail()).toMatchObject({ ready: true, wide: false });
    runtime.effects[0](); runtime.ready(); runtime.show(); runtime.resize(); flush();
    expect(vi.getTimerCount()).toBe(0); expect(runtime.queries).toHaveLength(0);
  });
  it('settles a narrow result in the same ready snapshot', () => {
    useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(response(750));
    expect(runtime.state[0]).toEqual({ ready: true, layout: null }); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['ready', 'nextTick', 'query'])('bounds a missing %s callback and rejects all late callbacks from that attempt', missing => {
    useRenderRail(true, missing !== 'ready'); runtime.effects[0]();
    const ticks = [...runtime.ticks];
    if (missing === 'query') flush();
    vi.advanceTimersByTime(299); expect(useRenderRail(true, missing !== 'ready').ready).toBe(false);
    vi.advanceTimersByTime(1);
    expect(runtime.state[0]).toEqual({ ready: true, layout: null }); expect(vi.getTimerCount()).toBe(0);
    ticks.forEach(callback => callback());
    runtime.queries.forEach(query => query.callback(response()));
    expect(runtime.state[0]).toEqual({ ready: true, layout: null });
  });
  it('does not spin a timer without data, and still gates the first data frame after native ready', () => {
    expect(useRenderRail(false).ready).toBe(false); const stop = runtime.effects[0](); runtime.ready(); flush();
    expect(vi.getTimerCount()).toBe(0); expect(runtime.queries).toHaveLength(0);
    stop(); expect(useRenderRail(true).ready).toBe(false); runtime.effects[1](); flush();
    expect(vi.getTimerCount()).toBe(1); runtime.queries[0].callback(response()); expect(useRenderRail().ready).toBe(true);
  });
  it('clears timers on hide, unmount and dependency cleanup without a state write, rejecting old queries', () => {
    useRenderRail(); const stop = runtime.effects[0](); flush(); const old = runtime.queries[0]; const pending = runtime.state[0];
    runtime.hide(); expect(vi.getTimerCount()).toBe(0); expect(runtime.state[0]).toBe(pending);
    old.callback(response()); expect(runtime.state[0]).toBe(pending);
    runtime.show(); flush(); const newer = runtime.queries[1]; stop();
    expect(vi.getTimerCount()).toBe(0); const before = runtime.state[0]; newer.callback(response()); expect(runtime.state[0]).toBe(before);
    useRenderRail(true, false); runtime.effects[1](); expect(vi.getTimerCount()).toBe(1);
    runtime.effects[1]()(); expect(vi.getTimerCount()).toBe(0);
  });
  it('hides a settled wide layout while resizing and does not let an old timeout settle the newer attempt', () => {
    useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(response());
    runtime.resize(); expect(useRenderRail()).toMatchObject({ ready: false, wide: false });
    vi.advanceTimersByTime(200); runtime.resize(); flush(); vi.advanceTimersByTime(100);
    expect(useRenderRail().ready).toBe(false);
    runtime.queries[1].callback(response()); expect(useRenderRail()).toMatchObject({ ready: true, wide: true });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('allows an explicit ready event to start a fresh attempt after timeout, without reviving the timed-out query', () => {
    useRenderRail(); runtime.effects[0](); flush(); const old = runtime.queries[0]; vi.advanceTimersByTime(300);
    runtime.ready(); flush(); old.callback(response()); expect(useRenderRail().ready).toBe(false);
    runtime.queries[1].callback(response()); expect(useRenderRail()).toMatchObject({ ready: true, wide: true });
  });
  it('settles inline immediately when scoped query construction throws', () => {
    vi.mocked(Taro.createSelectorQuery).mockImplementationOnce(() => { throw new Error('synthetic unsupported'); });
    useRenderRail(); runtime.effects[0](); flush();
    expect(useRenderRail()).toMatchObject({ ready: true, wide: false }); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('owned related-topic rail geometry', () => {
  it('captures this page once, scopes all queries and uses a stable unique id rather than global window width', () => {
    const owner = runtime.owner, first = useRenderRail(); runtime.effects[0](); flush();
    runtime.owner = { unrelatedNewPage: true };
    expect(useRenderRail().rootId).toBe(first.rootId);
    expect(runtime.queries[0].owner).toBe(owner);
    expect(runtime.queries[0].selectors).toEqual([`#${first.rootId}`, `#${first.viewportId}`]);
    runtime.queries[0].callback(response());
    const rail = useRenderRail(); expect(rail.wide).toBe(true);
    expect(rail.flowStyle).toEqual({ width: 'calc(100% - 356px)', maxWidth: '844px' });
    expect(rail.railStyle).toMatchObject({ left: '906px', top: '88px', width: '336px', height: '624px' });
  });
  it.each(['windows', 'mac'])('uses native desktop identity on %s', platform => {
    runtime.platform = platform; useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(response()); expect(useRenderRail().wide).toBe(true);
  });
  it('gives simultaneous instances different ids and still binds each captured owner', () => {
    const first = useRenderRail(); runtime.refs = []; runtime.state = []; runtime.owner = { second: true }; const second = useRenderRail();
    expect(second.rootId).not.toBe(first.rootId); expect(second.viewportId).not.toBe(first.viewportId);
  });
  it.each([1100, 1155, 1156, 1400])('uses actual owner width %s for the desktop threshold', width => {
    useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(response(width, { left: 50, top: 80, width, height: 640 }));
    expect(useRenderRail().wide).toBe(width >= 1156);
  });
  it.each(['ios', 'android', 'devtools'])('does not query width on %s', platform => {
    runtime.platform = platform; useRenderRail(); runtime.effects[0](); runtime.ready(); runtime.show(); runtime.resize(); flush();
    expect(Taro.createSelectorQuery).not.toHaveBeenCalled(); expect(useRenderRail().wide).toBe(false);
  });
  it('falls back inline without a captured page or an owner-scoping API', () => {
    runtime.owner = undefined; useRenderRail(); runtime.effects[0](); flush(); expect(runtime.queries).toHaveLength(0); expect(useRenderRail()).toMatchObject({ ready: true, wide: false }); expect(vi.getTimerCount()).toBe(0);
    runtime.refs = []; runtime.owner = {}; vi.mocked(Taro.createSelectorQuery).mockReturnValueOnce({ select: vi.fn() } as any);
    useRenderRail(); runtime.effects[runtime.effects.length - 1](); flush(); expect(useRenderRail()).toMatchObject({ ready: true, wide: false }); expect(vi.getTimerCount()).toBe(0);
  });
  it('uses the intersection of owning root and viewport so the rail never overlaps header/actions or escapes the pane', () => {
    useRenderRail(); runtime.effects[0](); flush();
    runtime.queries[0].callback([{ left: 100, top: 100, width: 1200, height: 500 }, { left: 80, top: 90, width: 1260, height: 700 }]);
    const layout = useRenderRail();
    expect(layout.railStyle).toMatchObject({ left: '956px', top: '108px', width: '336px', height: '484px' });
    expect(layout.flowStyle).toMatchObject({ maxWidth: '864px' });
    expect(80 + parseFloat(layout.flowStyle!.maxWidth)).toBeLessThan(parseFloat(layout.railStyle!.left));
  });
  it.each([null, {}, [], [{ left: NaN, top: 0, width: 1200, height: 600 }, { left: 0, top: 0, width: 1200, height: 500 }], [{ left: 0, top: 0, width: 1200, height: 0 }, { left: 0, top: 0, width: 1200, height: 500 }]].map(rects => ({ rects })))('keeps an empty or invalid measurement inline', ({ rects }) => {
    useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(rects); expect(useRenderRail()).toMatchObject({ ready: true, wide: false }); expect(vi.getTimerCount()).toBe(0);
  });
  it('drops old nextTick and query responses after resize and immediately returns safely inline', () => {
    useRenderRail(); runtime.effects[0](); runtime.resize(); flush(); expect(runtime.queries).toHaveLength(1);
    const old = runtime.queries[0]; old.callback(response()); expect(useRenderRail().wide).toBe(true);
    runtime.resize(); expect(useRenderRail().wide).toBe(false); flush();
    old.callback(response(1400)); expect(useRenderRail().wide).toBe(false);
    runtime.queries[1].callback(response(750)); expect(useRenderRail().wide).toBe(false);
  });
  it('ignores callbacks after hide/unmount and remeasures the same owner after show', () => {
    const owner = runtime.owner; useRenderRail(); const stop = runtime.effects[0](); flush(); const old = runtime.queries[0];
    runtime.hide(); old.callback(response()); expect(useRenderRail().wide).toBe(false);
    runtime.owner = {}; runtime.show(); flush(); expect(runtime.queries[1].owner).toBe(owner);
    runtime.queries[1].callback(response()); expect(useRenderRail().wide).toBe(true);
    const beforeUnmount = runtime.state[0]; stop(); runtime.queries[1].callback(response(1400)); expect(runtime.state[0]).toBe(beforeUnmount);
  });
  it('remeasures after loading becomes data-ready even if native ready came earlier', () => {
    useRenderRail(false); const stop = runtime.effects[0](); runtime.ready(); flush(); expect(runtime.queries).toHaveLength(0);
    stop(); useRenderRail(true); runtime.effects[1](); flush(); expect(runtime.queries).toHaveLength(1);
    runtime.queries[0].callback(response()); expect(useRenderRail().wide).toBe(true);
  });
  it.each(['ios', 'android', 'devtools'])('uses a normal View with every supplied related row and stable keys across mobile lifecycle on %s', platform => {
    runtime.platform = platform;
    const topicDetail = { relatingTopics: Array.from({ length: 25 }, (_, index) => ({ title: `synthetic ${index}`, authorLink: '/member/synthetic', authorAvatarUrl: '', link: `/t/${index}` })) } as any;
    const phases = [() => {}, () => runtime.ready(), () => runtime.hide(), () => runtime.show(), () => runtime.resize()];
    const rail = useRenderRail(); runtime.effects[0]();
    expect(rail).toMatchObject({ ready: true, wide: false });
    let first: any;
    for (const phase of phases) {
      phase(); flush();
      expect(runtime.state[0]).toEqual({ ready: true, layout: null });
      runtime.cursor = 1; // The rail occupies state[0]; this mounted list owns state[1].
      const list = RelatingTopics({ topicDetail, floating: rail.wide });
      first ??= list;
      expect(list.type).toBe('View'); expect(list.key).toBeNull();
      expect(list.props.scrollY).toBeUndefined(); expect(list.props.type).toBeUndefined();
      expect(list.props.enhanced).toBeUndefined(); expect(list.props.showScrollbar).toBeUndefined();
      expect(list.props.className).toBe(first.props.className);
      expect(list.props.children).toHaveLength(25);
      expect(list.props.children.map((row: any) => row.key)).toEqual(first.props.children.map((row: any) => row.key));
      expect(list.props.children.map((row: any) => row.props.children[1].props.children)).toEqual(topicDetail.relatingTopics.map((topic: any) => topic.title));
    }
    expect(runtime.queries).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('retains the same permanent related scroll owner, complete data and item keys in inline/wide/inline transitions', () => {
    const topicDetail = { relatingTopics: Array.from({ length: 25 }, (_, index) => ({ title: `synthetic ${index}`, authorLink: '/member/synthetic', authorAvatarUrl: '', link: `/t/${index}` })) } as any;
    const trees = [false, true, false].map(floating => { runtime.cursor = 0; return RelatingTopics({ topicDetail, floating }); });
    trees.forEach((tree, index) => {
      expect(tree.type).toBe('ScrollView'); expect(tree.key).toBeNull();
      expect(tree.props.scrollY).toBe(index === 1); expect(tree.props.type).toBe('custom');
      expect(tree.props.children).toHaveLength(25);
      expect(tree.props.children.map((row: any) => row.key)).toEqual(trees[0].props.children.map((row: any) => row.key));
    });
    const requireProject = createRequire(`${process.cwd()}/package.json`);
    const css = requireProject('sass').compile('src/pages/topicDetail/relatingTopics/index.module.scss').css;
    expect(css).toMatch(/\.floating\s*\{[^}]*flex: 1;[^}]*height: 0;[^}]*min-height: 0;/);
    expect(css).toMatch(/\.content\s*\{[^}]*width: 100%;[^}]*height: auto;/);
  });
  it('reserves a body column before the rail and releases it again after a narrow measurement', () => {
    useRenderRail(); runtime.effects[0](); flush(); runtime.queries[0].callback(response()); const wide = useRenderRail();
    const flowRight = 50 + 1200 - 356;
    const photoRight = flowRight - 8 - 12; // Actual desktop card margin and padding.
    expect(parseFloat(wide.railStyle!.left)).toBeGreaterThan(flowRight);
    expect(photoRight).toBeLessThan(parseFloat(wide.railStyle!.left));
    runtime.resize(); flush(); runtime.queries[1].callback(response(750));
    expect(useRenderRail().flowStyle).toBeUndefined(); expect(useRenderRail().railStyle).toBeUndefined();
  });
  it('keeps the one related instance in the original flow with independent wide scrolling and no content remount keys', () => {
    const detail = readFileSync('src/pages/topicDetail/index.tsx', 'utf8');
    expect(detail.match(/<RelatingTopics\b/g)).toHaveLength(1);
    expect(detail).toContain('floating={relatedRail.wide}');
    expect(detail).toContain('style={relatedRail.flowStyle}');
    expect(detail).toContain('id={relatedRail.rootId}');
    const related = readFileSync('src/pages/topicDetail/relatingTopics/index.tsx', 'utf8');
    expect(related.match(/<ScrollView\b/g)).toHaveLength(1);
    expect(related).toContain('scrollY={floating}');
    expect(related).not.toMatch(/getTopicDetail|useDataWithCache|key=\{floating/);
    const requireProject = createRequire(`${process.cwd()}/package.json`);
    const css = requireProject('sass').compile('src/pages/topicDetail/index.scss').css;
    expect(css).toMatch(/\.topicDetail \.relatingTopics--floating\s*\{[^}]*position: fixed;[^}]*box-sizing: border-box;/);
    const hook = readFileSync('src/pages/topicDetail/useRelatedTopicsRail.ts', 'utf8');
    expect(hook).not.toMatch(/getCurrentPages|getWindowInfo|windowWidth|setInterval/);
    expect(hook.match(/setTimeout\(/g)).toHaveLength(1);
  });
});
