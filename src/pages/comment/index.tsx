import { View, Textarea } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState } from "react";
import { createNewComment } from "guanggu-forum-api";
import "./index.scss";

const CommentPage = () => {
  const router = useRouter();
  const { tid, xsrf, content: initialContent } = router.params;
  const [commentContent, setCommentContent] = useState(decodeURIComponent(initialContent || ""));
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleSend = () => {
    if (sending || !commentContent.trim()) return;
    setSending(true);
    Taro.showLoading({ title: "发送中...", mask: true });
    createNewComment({
      tid: tid!,
      _xsrf: decodeURIComponent(xsrf || ""),
      content: commentContent,
    })
      .then(() => {
        Taro.hideLoading();
        Taro.showToast({ title: "发送成功", icon: "success" });
        setTimeout(() => {
          Taro.navigateBack();
        }, 500);
      })
      .catch(() => {
        Taro.hideLoading();
        Taro.showToast({ title: "发送失败", icon: "none" });
      })
      .finally(() => {
        setSending(false);
      });
  };

  return (
    <View
      className="commentPage"
      style={{
        transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : 'none',
        transition: 'transform 0.2s ease-out',
      }}
    >
      <View className="commentPageHeader">
        <View className="commentPageCancel" onClick={() => Taro.navigateBack()}>
          取消
        </View>
        <View className="commentPageTitle">评论</View>
        <View
          className={`commentPageSend ${sending || !commentContent.trim() ? "commentPageSend--disabled" : ""}`}
          onClick={handleSend}
        >
          {sending ? "发送中..." : "发送"}
        </View>
      </View>
      <Textarea
        className="commentPageTextarea"
        adjustPosition={false}
        autoFocus
        onInput={(event) => {
          setCommentContent(event.detail.value);
        }}
        value={commentContent}
        showConfirmBar={false}
        placeholder="说点什么"
        onKeyboardHeightChange={(e) => {
          setKeyboardHeight(e.detail.height);
        }}
      />
    </View>
  );
};

export default CommentPage;
