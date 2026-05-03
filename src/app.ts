import { Component } from "react";
import "./app.scss";
import { registerSkylineRoutes } from "./utils/skylineRoutes";
import { cleanupCache, shouldRunDailyCleanup } from "guanggu-forum-api";

class App extends Component {
  componentDidMount() {
    registerSkylineRoutes();
    if (shouldRunDailyCleanup()) {
      cleanupCache();
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
