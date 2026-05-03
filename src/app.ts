import { Component } from "react";
import "./app.scss";
import { registerSkylineRoutes } from "./utils/skylineRoutes";
import { setCacheService, setOnLoginRequired } from "guanggu-forum-api";
import { cacheService } from "./utils/CacheService";
import { openLoginModal } from "./utils/auth";

class App extends Component {
  componentDidMount() {
    setCacheService(cacheService);
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
