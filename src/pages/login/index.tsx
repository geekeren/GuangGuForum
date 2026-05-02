import { Input, View, Text } from "@tarojs/components";
import "./index.scss";
import { useState, useEffect, useRef } from "react";
import { login } from "guanggu-forum-api";
import Taro, { useRouter } from "@tarojs/taro";
import Navbar from "../../components/Navbar";
import { BRAND_COLOR } from "../../utils/theme";
import { linkHandler } from "../../utils/linkHandler";

const SAVED_ACCOUNTS_KEY = "saved_accounts";

function getSavedAccounts(): string[] {
  try {
    return JSON.parse(Taro.getStorageSync(SAVED_ACCOUNTS_KEY) || "[]");
  } catch { return []; }
}

function saveAccount(email: string) {
  if (!email) return;
  const list = getSavedAccounts().filter((a) => a !== email);
  list.unshift(email);
  try { Taro.setStorageSync(SAVED_ACCOUNTS_KEY, JSON.stringify(list.slice(0, 5))); } catch {}
}

interface LoginParams {
  user?: string;
  password?: string;
}

export default function Login() {
  const [input, setInput] = useState<LoginParams>({});
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const allAccounts = useRef<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    allAccounts.current = getSavedAccounts();
  }, []);

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
      saveAccount(input.user!);
      Taro.showToast({ title: "登录成功", icon: "success", duration: 1000 });
      setTimeout(() => {
        const { redirect } = router.params;
        const redirectUrl = redirect
          ? (decodeURIComponent(redirect).startsWith("/") ? decodeURIComponent(redirect) : "/" + decodeURIComponent(redirect))
          : "/pages/home/index";
        Taro.reLaunch({ url: redirectUrl });
      }, 1000);
    });
  };

  const handleChange = (name: string, value: string | number) => {
    const val = String(value);
    const inputContent = { ...input, [name]: val };
    setInput(inputContent);
    if (name === "user") {
      if (!val) {
        setSuggestions(allAccounts.current);
        setShowSuggestions(true);
      } else {
        const filtered = allAccounts.current.filter((a) =>
          a.toLowerCase().includes(val.toLowerCase())
        );
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
      }
    }
  };

  return (
    <View className='loginPage'>
      <Navbar back />
      <View className='loginHeader'>
        <View className='logoBadge'>早</View>
        <Text className='loginTitle'>登录过早客</Text>
        <View className='loginSubtitle'>武汉本地生活社区，欢迎回来</View>
      </View>

      <View className='loginCard'>
        <View className='inputField inputField--withDropdown'>
          <Text className='inputLabel'>用户</Text>
          <Input
            cursorColor={BRAND_COLOR}
            className='inputControl'
            type='text'
            placeholder='支持通过 E-mail，手机号登录'
            placeholderClass='inputPlaceholder'
            value={input.user || ""}
            onInput={(e) => handleChange("user", e.detail.value)}
            onFocus={() => {
              const val = input.user || "";
              const filtered = val
                ? allAccounts.current.filter((a) => a.toLowerCase().includes(val.toLowerCase()))
                : allAccounts.current;
              setSuggestions(filtered);
              setShowSuggestions(filtered.length > 0);
            }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoFocus
          />
          {showSuggestions && suggestions.length > 0 && (
            <View className='accountSuggestions'>
              {suggestions.map((account) => (
                <View
                  key={account}
                  className='accountSuggestionItem'
                  onTouchStart={() => {
                    setInput({ ...input, user: account });
                    setShowSuggestions(false);
                  }}
                >
                  <Text className='accountSuggestionText'>{account}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <View className='inputField'>
          <Text className='inputLabel'>密码</Text>
          <Input
            cursorColor={BRAND_COLOR}
            className='inputControl'
            type='text'
            password
            placeholder='请输入密码（不少于 6 个字符）'
            placeholderClass='inputPlaceholder'
            value={input.password || ""}
            onInput={(e) => handleChange("password", e.detail.value)}
          />
        </View>
      </View>

      <View className='agreementRow'>
        <View className={`checkbox ${agreed ? "checkbox--checked" : ""}`} onClick={() => setAgreed(!agreed)}>
          {agreed && <Text className='checkmark'>✓</Text>}
        </View>
        <Text className='agreementText' onClick={() => setAgreed(!agreed)}>
          我已阅读并同意
          <Text className='agreementLink' onClick={(e) => {
            e.stopPropagation();
            wx.openPrivacyContract();
          }}>《用户隐私保护指引》</Text>
          ，承诺遵守法律法规，文明发言，尊重他人
        </Text>
      </View>

      <View className='loginActions'>
        <View className={`loginBtn ${loading || !agreed ? "loginBtn--disabled" : ""}`} onClick={handleSubmit}>
          <Text>{loading ? "登录中..." : "登录"}</Text>
        </View>
      </View>

      <View className='loginFooter'>
        <View className='webTip'>更多操作如注册，请前往网页端 <Text className='webLink' onClick={() => linkHandler("https://www.guozaoke.com/")}>https://www.guozaoke.com/</Text> 进行</View>
      </View>
    </View>
  );
}
