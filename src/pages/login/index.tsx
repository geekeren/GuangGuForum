import { View } from "@tarojs/components";
import { AtButton, AtInput } from 'taro-ui'
import "taro-ui/dist/style/components/form.scss";
import "taro-ui/dist/style/components/input.scss";
import "taro-ui/dist/style/components/button.scss";
import { useState } from "react";
import { login } from "guanggu-forum-api";
import Taro, { useRouter } from "@tarojs/taro";

interface LoginParams { user?: string; password?: string }

export default function Login() {
    const [input, setInput] = useState<LoginParams>({});
    const router = useRouter();
    const { redirect } = router.params;
    const validate = (input: LoginParams) => {
        return input?.user && (input?.password?.length || 0) >= 6;
    };

    const handleSubmit = () => {
        if (!validate(input)) {
            Taro.showToast({
                icon: 'error',
                title: '输入无效'
            })
            return;
        }
        login({
            email: input.user!,
            password: input.password!,
        }).then(() => {
            if (redirect) {
                Taro.reLaunch({
                    url: decodeURIComponent(redirect)
                });
            } else {
                Taro.reLaunch({
                    url: '/pages/home/index',
                })
            }
        })
    }

    const handleChange = (name: string, value: string | number) => {
        const inputContent = {
            ...input,
            [name]: String(value),
        };
        setInput(inputContent);
    }

    return (<View style={{ padding: 10 }}>
        <AtInput
            name='value'
            title='用户'
            type='text'
            placeholder='支持通过E-mail，手机号登录'
            value={input.user || ''}
            onChange={(value) => {
                handleChange('user', value);
            }}
        />
        <AtInput
            name='password'
            title='密码'
            type='password'
            placeholder='请输入密码（不少于6个字符）'
            value={input.password || ''}
            onChange={(value) => {
                handleChange('password', value);
            }}
        />

        <View style={{ marginTop: 30 }}>
            <AtButton type={"primary"} onClick={handleSubmit}>登录</AtButton>
        </View>
    </View>)
}
