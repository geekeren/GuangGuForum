import Taro from "@tarojs/taro";
import { request } from "../client";
import { URLS } from "../urls";

export async function logout() {
  return request("/logout", {
    method: "GET",
  }).then(() => {
    Taro.removeStorageSync("cookies");
    Taro.removeStorageSync("current_username");
  });
}
