import { View, Text } from "@tarojs/components";
import { AtButton, AtInput } from "taro-ui";
import "taro-ui/dist/style/components/form.scss";
import "taro-ui/dist/style/components/input.scss";
import "taro-ui/dist/style/components/button.scss";
import "./index.scss";
import { useState } from "react";
import { login } from "guanggu-forum-api";
import Taro, { useRouter } from "@tarojs/taro";

interface LoginParams {
  user?: string;
  password?: string;
}

export default function Login() {
  const [input, setInput] = useState<LoginParams>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { redirect } = router.params;
  const validate = (input: LoginParams) => {
    return input?.user && (input?.password?.length || 0) >= 6;
  };

  const handleSubmit = () => {
    if (!validate(input)) {
      Taro.showToast({
        icon: "error",
        title: "输入无效",
      });
      return;
    }
    setLoading(true);
    Taro.showLoading({ title: "登录中...", mask: true });
    login({
      email: input.user!,
      password: input.password!,
    }).finally(() => {
      setLoading(false);
      Taro.hideLoading();
    }).then(() => {
      if (redirect) {
        Taro.reLaunch({
          url: decodeURIComponent(redirect),
        });
      } else {
        Taro.reLaunch({
          url: "/pages/home/index",
        });
      }
    });
  };

  const handleChange = (name: string, value: string | number) => {
    const inputContent = {
      ...input,
      [name]: String(value),
    };
    setInput(inputContent);
  };

  return (
    <View className="loginPage">
      <View className="loginHeader">
        <View className="logoBadge">早</View>
        <Text className="loginTitle">登录过早客</Text>
        <View className="loginSubtitle">武汉本地生活社区，欢迎回来</View>
      </View>

      <View className="loginCard">
        <AtInput
          name="value"
          title="用户"
          type="text"
          placeholder="支持通过 E-mail，手机号登录"
          value={input.user || ""}
          onChange={(value) => {
            handleChange("user", value);
          }}
        />
        <AtInput
          name="password"
          title="密码"
          type="password"
          placeholder="请输入密码（不少于 6 个字符）"
          value={input.password || ""}
          onChange={(value) => {
            handleChange("password", value);
          }}
        />
      </View>

      <View className="loginActions">
        <AtButton type={"primary"} onClick={handleSubmit} disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </AtButton>
      </View>

      <View className="loginFooter">
        <View>登录即表示同意《用户协议》和《隐私政策》</View>
        <View className="webTip">更多操作如注册，请前往网页端 <Text className="webLink" onClick={() => Taro.setClipboardData({ data: "https://www.guozaoke.com/" })}>https://www.guozaoke.com/</Text> 进行</View>
      </View>
    </View>
  );
}
