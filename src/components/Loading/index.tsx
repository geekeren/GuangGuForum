import { GzkLoading, type GzkLoadingProps } from "gzk-ui/loading";

export default function Loading({ className = "", labelClassName = "", ...props }: GzkLoadingProps) {
  // Preserve the existing .loading .tip page selectors without adding legacy styles to the library.
  const legacyClassName = `loading${props.fullscreen ? " loading--fullscreen" : ""}${className ? ` ${className}` : ""}`;
  return <GzkLoading {...props} className={legacyClassName} labelClassName={`tip${labelClassName ? ` ${labelClassName}` : ""}`} />;
}
