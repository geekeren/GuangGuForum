import Taro, { useDidHide, useDidShow, useReady, useResize } from '@tarojs/taro';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopClient } from '../../utils/desktopLayout';

type Rect = { left: number; top: number; width: number; height: number };
type Rail = { left: string; top: string; width: string; height: string };
type Layout = { rail: Rail; maxBodyWidth: number };
let nextRailId = 0;
const RAIL_WIDTH = 336;
const RAIL_GAP = 20;
const MIN_BODY_WIDTH = 800;
const EDGE = 8;
const MEASUREMENT_TIMEOUT = 300;
function validRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Rect;
  return [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}

/** Page-local visual geometry only. Missing native ownership always keeps the inline list. */
export function useRelatedTopicsRail(hasData: boolean, pageReady: boolean) {
  const desktop = isDesktopClient();
  const identity = useRef<{ rootId: string; viewportId: string; page: ReturnType<typeof Taro.getCurrentInstance>['page'] }>();
  if (!identity.current) {
    const id = ++nextRailId;
    identity.current = { rootId: `topic-related-root-${id}`, viewportId: `topic-related-viewport-${id}`, page: Taro.getCurrentInstance?.().page };
  }
  const owner = identity.current;
  // Cached desktop data must not expose the inline tree before its first query.
  const [snapshot, setSnapshot] = useState<{ ready: boolean; layout: Layout | null }>(() => ({ ready: !desktop, layout: null }));
  const lifecycle = useRef({ mounted: true, visible: true, ready: pageReady, generation: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined });
  const dataReady = useRef(hasData);
  dataReady.current = hasData;
  const invalidate = useCallback(() => {
    const scope = lifecycle.current;
    scope.generation += 1;
    if (scope.timer !== undefined) clearTimeout(scope.timer);
    scope.timer = undefined;
  }, []);
  const measure = useCallback(() => {
    invalidate();
    const scope = lifecycle.current;
    if (!scope.mounted || !scope.visible) return;
    if (!desktop) { setSnapshot({ ready: true, layout: null }); return; }
    setSnapshot({ ready: false, layout: null });
    if (!dataReady.current) return;
    const generation = scope.generation;
    const current = () => scope.mounted && scope.visible && generation === scope.generation;
    const finish = (layout: Layout | null = null) => {
      if (!current()) return;
      // Settlement invalidates this attempt, including any callback arriving
      // after timeout. Readiness and geometry become visible in one commit.
      invalidate();
      setSnapshot({ ready: true, layout });
    };
    if (!owner.page) { finish(); return; }
    // One bounded fallback per explicitly triggered measurement; never polling.
    scope.timer = setTimeout(() => finish(), MEASUREMENT_TIMEOUT);
    if (!scope.ready) return;
    try {
      Taro.nextTick(() => {
        if (!current()) return;
        try {
          // Capture the owning native page, never the latest frameset page.
          const query = Taro.createSelectorQuery();
          if (typeof query.in !== 'function') { finish(); return; }
          query.in(owner.page!).select(`#${owner.rootId}`).boundingClientRect();
          query.select(`#${owner.viewportId}`).boundingClientRect();
          query.exec((rects: unknown[]) => {
            if (!current()) return;
            if (!Array.isArray(rects)) { finish(); return; }
            const [root, viewport] = rects;
            if (!validRect(root) || !validRect(viewport)) { finish(); return; }
            const left = Math.max(root.left, viewport.left);
            const top = Math.max(root.top, viewport.top);
            const right = Math.min(root.left + root.width, viewport.left + viewport.width);
            const bottom = Math.min(root.top + root.height, viewport.top + viewport.height);
            // 800px body + 20px separation + 336px rail. No whole-window breakpoint.
            if (![left, top, right, bottom].every(Number.isFinite)
              || right - left < MIN_BODY_WIDTH + RAIL_GAP + RAIL_WIDTH || bottom - top <= 2 * EDGE) { finish(); return; }
            finish({
              rail: { left: `${right - RAIL_WIDTH - EDGE}px`, top: `${top + EDGE}px`, width: `${RAIL_WIDTH}px`, height: `${bottom - top - 2 * EDGE}px` },
              maxBodyWidth: right - viewport.left - RAIL_WIDTH - RAIL_GAP,
            });
          });
        } catch {
          // Older or unsupported page-scoped query implementations stay inline.
          finish();
        }
      });
    } catch { finish(); }
  }, [desktop, owner, invalidate]);
  useEffect(() => {
    const scope = lifecycle.current;
    scope.mounted = true;
    scope.ready = pageReady;
    measure();
    return () => { scope.mounted = false; invalidate(); };
  }, [hasData, pageReady, measure, invalidate]);
  useReady(() => { lifecycle.current.ready = true; measure(); });
  useDidShow(() => { lifecycle.current.visible = true; measure(); });
  useDidHide(() => { lifecycle.current.visible = false; invalidate(); });
  useResize(() => { measure(); });
  const { layout } = snapshot;
  return { rootId: owner.rootId, viewportId: owner.viewportId, ready: !desktop || (hasData && snapshot.ready), wide: !!layout,
    flowStyle: layout ? { width: `calc(100% - ${RAIL_WIDTH + RAIL_GAP}px)`, maxWidth: `${layout.maxBodyWidth}px` } : undefined,
    railStyle: layout?.rail };
}
