import { Component } from "react";
import { setCacheService, setOnLoginRequired, setOnUnreadNotifications } from "guanggu-forum-api";
import "./app.scss";
import { cacheService, CACHE_UPGRADE_VERSION } from "./utils/CacheService";
import { openLoginModal } from "./utils/auth";
import { updateUnreadNotifications } from "./utils/unreadNotifications";

class App extends Component {
  componentDidMount() {
    setCacheService(cacheService);
    cacheService.clearForUpgradeOnce(CACHE_UPGRADE_VERSION);
    setOnUnreadNotifications(updateUnreadNotifications);
    setOnLoginRequired(() => openLoginModal());
    if (cacheService.shouldRunDailyCleanup()) {
      cacheService.dailyCleanup();
    }
  }

  componentDidShow() {}

  componentDidHide() {}

  componentDidCatchError() {}

  render() {
    return this.props?.children;
  }
}

export default App;
