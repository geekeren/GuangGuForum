import { Input, View, Text } from "@tarojs/components";
import { AtButton } from "taro-ui";
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
  const [agreed, setAgreed] = useState(false);
  const router = useRouter();
  const { redirect } = router.params;
  const validate = (input: LoginParams) => {
    return input?.user && (input?.password?.length || 0) >= 6;
  };

  const handleSubmit = () => {
    if (!agreed) {
      Taro.showToast({
        icon: "none",
        title: "请先同意社区公约",
      });
      return;
    }
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
        <View className="inputField">
          <Text className="inputLabel">用户</Text>
          <Input
            className="inputControl"
            type="text"
            placeholder="支持通过 E-mail，手机号登录"
            placeholderClass="inputPlaceholder"
            value={input.user || ""}
            onInput={(e) => handleChange("user", e.detail.value)}
          />
        </View>
        <View className="inputField">
          <Text className="inputLabel">密码</Text>
          <Input
            className="inputControl"
            type="password"
            placeholder="请输入密码（不少于 6 个字符）"
            placeholderClass="inputPlaceholder"
            value={input.password || ""}
            onInput={(e) => handleChange("password", e.detail.value)}
          />
        </View>
      </View>

      <View className="agreementRow" onClick={() => setAgreed(!agreed)}>
        <View className={`checkbox ${agreed ? "checkbox--checked" : ""}`}>
          {agreed && <Text className="checkmark">✓</Text>}
        </View>
        <Text className="agreementText">我承诺遵守法律法规，文明发言，尊重他人。讨论政治话题时保持理性，不传播不实信息或煽动对立。我不进行人身攻击、刷屏或发布广告，注意保护隐私，共同维护良好交流环境</Text>
      </View>

      <View className="loginActions">
        <AtButton type={"primary"} onClick={handleSubmit} disabled={loading || !agreed}>
          {loading ? "登录中..." : "登录"}
        </AtButton>
      </View>

      <View className="loginFooter">
        <View className="webTip">更多操作如注册，请前往网页端 <Text className="webLink" onClick={() => Taro.setClipboardData({ data: "https://www.guozaoke.com/" })}>https://www.guozaoke.com/</Text> 进行</View>
      </View>
    </View>
  );
}
