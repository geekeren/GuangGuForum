import { Component } from "react";
import "./app.scss";
import { registerSkylineRoutes } from "./utils/skylineRoutes";

class App extends Component {
  componentDidMount() {
    registerSkylineRoutes();
  }

  componentDidShow() {}

  componentDidHide() {}

  componentDidCatchError() {}

  render() {
    return this.props?.children;
  }
}

export default App;
