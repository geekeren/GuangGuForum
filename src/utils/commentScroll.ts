interface Rect { top: number; bottom: number; height: number }

export interface CommentScrollGeometry {
  target?: Rect | null;
  viewport?: Rect | null;
  navbar?: Rect | null;
  scroll?: { scrollTop: number; scrollHeight: number } | null;
}

export function getCommentScrollTop({ target, viewport, navbar, scroll }: CommentScrollGeometry): number | undefined {
  if (!target || !viewport || !scroll || target.height <= 0 || viewport.height <= 0) return undefined;
  // Navbar may be in normal flow or overlap a full-screen ScrollView. Count only the overlap.
  const overlap = Math.max(0, (navbar?.bottom ?? viewport.top) - viewport.top);
  const top = scroll.scrollTop + target.top - viewport.top - overlap - 8;
  return Math.max(0, Math.min(top, Math.max(0, scroll.scrollHeight - viewport.height)));
}

interface LayoutSnapshot { top: number; contentHeight: number }

export interface CommentScrollTask {
  nextTick: (callback: () => void) => void;
  measure: (callback: (geometry: CommentScrollGeometry) => void) => void;
  apply: (top: number) => void;
  settled?: () => void;
}

// Wait for committed native layout, retry absent nodes, and remeasure async HTML/images.
// Corrections are bounded and cancelled on user interaction/unmount by the caller.
export function startCommentScroll(task: CommentScrollTask): () => void {
  let cancelled = false;
  let attempts = 0;
  let stable = 0;
  let previous: LayoutSnapshot | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const measure = () => task.nextTick(() => {
    if (cancelled) return;
    task.measure((geometry) => {
      if (cancelled) return;
      attempts += 1;
      const top = getCommentScrollTop(geometry);
      if (top !== undefined) {
        const contentHeight = geometry.scroll!.scrollHeight;
        stable = previous && Math.abs(previous.top - top) < 1 && previous.contentHeight === contentHeight ? stable + 1 : 0;
        // No animation for native-layout corrections: measuring halfway through an animation drifts.
        if (!previous || Math.abs(geometry.scroll!.scrollTop - top) >= 1) task.apply(top);
        previous = { top, contentHeight };
      }
      if (attempts >= 20 || (previous && attempts >= 10 && stable >= 3)) {
        task.settled?.();
      } else {
        timer = setTimeout(measure, 100);
      }
    });
  });
  measure();
  return () => { cancelled = true; if (timer) clearTimeout(timer); };
}
