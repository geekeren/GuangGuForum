import { forwardRef, useImperativeHandle, useRef } from "react";
import { Text, View } from "@tarojs/components";
import "./index.scss";

const DEFAULT_THRESHOLD = 80;

export interface PullDownRefreshRef {
  onScroll: (scrollTop: number) => void;
  onTouchStart: (e: any) => void;
  onTouchMove: (e: any) => void;
  onTouchEnd: (e: any) => void;
}

interface PullDownRefreshProps {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

const PullDownRefresh = forwardRef<PullDownRefreshRef, PullDownRefreshProps>(
  ({ onRefresh, threshold = DEFAULT_THRESHOLD, style, className, children }, ref) => {
    const distanceRef = useRef(0);
    const scrollTopRef = useRef(0);
    const touchStartYRef = useRef(0);
    const pullingRef = useRef(false);
    const tipElRef = useRef<any>(null);

    const updateTip = (distance: number) => {
      const el = tipElRef.current;
      if (!el) return;
      if (distance > 0) {
        el.style.display = "flex";
        el.style.height = distance + "px";
        el.children[0].textContent =
          distance >= threshold ? "释放刷新" : "下拉刷新";
      } else {
        el.style.display = "none";
        el.style.height = "0px";
      }
    };

    const reset = () => {
      pullingRef.current = false;
      distanceRef.current = 0;
      updateTip(0);
    };

    const finishPull = () => {
      if (!pullingRef.current) return;
      if (distanceRef.current >= threshold) {
        onRefresh();
      }
      reset();
    };

    const handleTouchStart = (e: any) => {
      if (scrollTopRef.current <= 0) {
        touchStartYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const handleTouchMove = (e: any) => {
      if (!pullingRef.current) return;
      const deltaY = e.touches[0].clientY - touchStartYRef.current;
      if (deltaY > 0 && scrollTopRef.current <= 0) {
        const distance = Math.min(deltaY * 0.5, 150);
        distanceRef.current = distance;
        updateTip(distance);
      } else if (deltaY < 0) {
        reset();
      }
    };

    const handleTouchEnd = () => {
      finishPull();
    };

    useImperativeHandle(ref, () => ({
      onScroll: (scrollTop: number) => {
        if (scrollTop > 0 && distanceRef.current > 0) {
          reset();
        }
        scrollTopRef.current = scrollTop;
      },
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    }));

    return (
      <View
        className={className}
        style={{ position: "relative", flex: 1, overflow: "hidden", ...style }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <View className="pullDownTip" ref={tipElRef} style={{ display: "none", height: 0 }}>
          <Text className="pullDownText">下拉刷新</Text>
        </View>
        {children}
      </View>
    );
  },
);

export default PullDownRefresh;
