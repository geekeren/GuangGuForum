import { Children, cloneElement, Component, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import ThemePage from "./components/ThemePage";
import { refreshSystemTheme, startThemeListener } from "./utils/themePreferences";

type PageWrapperProps = { children?: ReactNode; tid?: string };
const themedWrappers = new WeakMap<object, unknown>();

function wrapPageElement(child: ReactNode): ReactNode {
  if (!isValidElement<PageWrapperProps>(child) || !child.props.tid || typeof child.type !== "function") return child;
  const original = child.type as typeof Component<PageWrapperProps>;
  let wrapper = themedWrappers.get(original);
  if (!wrapper) {
    // Taro's connectReactPage returns a class containing the native <root>.
    // Insert theme metadata there without adding a layout wrapper to the page.
    wrapper = class extends original {
      render() {
        const root = super.render() as ReactElement<{ children?: ReactNode }>;
        return cloneElement(root, {}, createElement(ThemePage, null, root.props.children));
      }
    };
    themedWrappers.set(original, wrapper);
  }
  return createElement(wrapper as typeof original, { ...child.props, key: child.key });
}
import { setCacheService, setOnLoginRequired, setOnUnreadNotifications } from "guanggu-forum-api";
import "./app.scss";
import { cacheService } from "./utils/CacheService";
import { openLoginModal } from "./utils/auth";
import { updateUnreadNotifications } from "./utils/unreadNotifications";

class App extends Component<{ children?: ReactNode }> {
  private stopThemeListener?: () => void;

  componentDidMount() {
    this.stopThemeListener = startThemeListener();
    setCacheService(cacheService);
    // Remove credentials persisted by the old local-only image-host settings.
    cacheService.remove('image_host_api_tokens', true);
    void cacheService.migrateTopicCachesAsync();
    setOnUnreadNotifications(updateUnreadNotifications);
    setOnLoginRequired(() => openLoginModal());
    if (cacheService.shouldRunDailyCleanup()) {
      void cacheService.dailyCleanupAsync();
    }
  }

  componentDidShow() { refreshSystemTheme(); }

  componentWillUnmount() { this.stopThemeListener?.(); }

  componentDidHide() {}

  componentDidCatchError() {}

  render() {
    return Children.map(this.props?.children, wrapPageElement);
  }
}

export default App;
