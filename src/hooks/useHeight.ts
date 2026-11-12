import { useReady } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { usePageScope } from "./usePageScope";
import { createPageSelectorQuery, nextTickForPage } from "../utils/pageScope";

export const useHeight = (id: string) => {
  const { owner, viewport } = usePageScope();
  const [height, setHeight] = useState(0);
  const current = useRef({ active: true, revision: 0 });
  const measure = () => {
    const revision = ++current.current.revision;
    nextTickForPage(owner, () => {
      if (!current.current.active || revision !== current.current.revision) return;
      try {
        createPageSelectorQuery(owner).select(`#${id}`).boundingClientRect(result => {
          const rect = Array.isArray(result) ? result[0] : result;
          if (current.current.active && revision === current.current.revision && rect?.height) setHeight(rect.height);
        }).exec();
      } catch { /* The page may have unloaded before native layout committed. */ }
    });
  };
  useReady(measure);
  useEffect(() => {
    current.current.active = true;
    const stop = viewport.subscribe(measure);
    return () => { current.current.active = false; current.current.revision++; stop(); };
  }, [owner, viewport, id]);
  return height;
};
