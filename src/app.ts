import { Component } from "react";
import "./app.scss";
import { registerSkylineRoutes } from "./utils/skylineRoutes";
import { setCacheService } from "guanggu-forum-api";
import { cacheService } from "./utils/CacheService";

class App extends Component {
  componentDidMount() {
    setCacheService(cacheService);
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
