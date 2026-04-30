import { View, Text, Textarea, Picker } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import { createTopic, NodeGroup } from "guanggu-forum-api";
import {
  getCachedNodeNavigation,
  fetchAndCacheNodeNavigation,
} from "../../utils/nodeNavigation";
import Navbar from "../../components/Navbar";
import "./index.scss";

const LAST_NODE_KEY = "last_selected_node";

export default function CreateTopic() {
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [pickerValue, setPickerValue] = useState<[number, number]>([0, 0]);
  const [tempPickerValue, setTempPickerValue] = useState<[number, number]>([0, 0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const contentRef = useRef<any>(null);

  const restorePicker = (groups: NodeGroup[], preferNodeSlug?: string) => {
    if (preferNodeSlug) {
      for (let gi = 0; gi < groups.length; gi++) {
        const ni = groups[gi].nodes.findIndex((n) => n.slug === preferNodeSlug);
        if (ni >= 0) {
          setPickerValue([gi, ni]);
          setTempPickerValue([gi, ni]);
          return;
        }
      }
    }
    try {
      const saved = Taro.getStorageSync(LAST_NODE_KEY);
      if (saved) {
        const { groupIndex, nodeIndex } = JSON.parse(saved);
        if (groupIndex < groups.length && nodeIndex < (groups[groupIndex]?.nodes?.length || 0)) {
          setPickerValue([groupIndex, nodeIndex]);
          setTempPickerValue([groupIndex, nodeIndex]);
        }
      }
    } catch {}
  };

  const router = useRouter();
  const nodeSlug = router.params.node;

  useEffect(() => {
    const cached = getCachedNodeNavigation();
    if (cached.length) {
      setNodeGroups(cached);
      restorePicker(cached, nodeSlug);
    }
    fetchAndCacheNodeNavigation().then((groups) => {
      setNodeGroups(groups);
      restorePicker(groups, nodeSlug);
    });
  }, []);

  const currentGroup = nodeGroups[tempPickerValue[0]];
  const confirmedGroup = nodeGroups[pickerValue[0]];
  const confirmedNode = confirmedGroup?.nodes?.[pickerValue[1]];

  // 标题输入：第一行作为标题，换行时自动跳到内容
  const handleTitleInput = (e: any) => {
    const val = e.detail.value;
    if (val.includes("\n")) {
      const parts = val.split("\n");
      const newTitle = parts[0];
      const restContent = parts.slice(1).join("\n");
      setTitle(newTitle);
      setContent((prev) => restContent + (prev ? "\n" + prev : ""));
      // 聚焦到内容输入框
      setTimeout(() => {
        contentRef.current?.focus?.();
      }, 50);
    } else {
      setTitle(val);
    }
  };

  const handleSubmit = async () => {
    if (!confirmedNode) {
      Taro.showToast({ title: "请选择板块", icon: "none" });
      return;
    }
    if (!title.trim()) {
      Taro.showToast({ title: "请输入标题", icon: "none" });
      return;
    }
    if (!content.trim()) {
      Taro.showToast({ title: "请输入内容", icon: "none" });
      return;
    }
    setSubmitting(true);
    Taro.showLoading({ title: "发布中...", mask: true });
    try {
      await createTopic({
        node: confirmedNode.slug,
        title: title.trim(),
        content: content.trim(),
      });
      Taro.hideLoading();
      Taro.eventCenter.trigger("refreshTopics");
      Taro.navigateBack();
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: "发布失败", icon: "none" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="createTopic">
      <Navbar title="发帖" back home />
      <View className="section nodeSection">
        <Picker
          mode="multiSelector"
          range={[nodeGroups.map((g) => g.category), currentGroup?.nodes?.map((n) => n.name) || []]}
          value={tempPickerValue}
          onChange={(e) => {
            const val = e.detail.value as [number, number];
            setPickerValue(val);
            setTempPickerValue(val);
            try {
              Taro.setStorageSync(LAST_NODE_KEY, JSON.stringify({ groupIndex: val[0], nodeIndex: val[1] }));
            } catch {}
          }}
          onColumnChange={(e) => {
            const { column, value } = e.detail;
            if (column === 0) {
              setTempPickerValue([value, 0]);
            } else {
              setTempPickerValue([tempPickerValue[0], value]);
            }
          }}
        >
          <View className="pickerItem">
            <Text className="pickerLabel">发布到</Text>
            <Text className="pickerValue">{confirmedNode ? `${confirmedGroup.category} · ${confirmedNode.name}` : "选择板块"}</Text>
            <Text className="arrow">▼</Text>
          </View>
        </Picker>
      </View>

      <View className="editorSection">
        <Textarea
          className="titleInput"
          placeholder="标题"
          placeholderClass="titlePlaceholder"
          maxlength={120}
          value={title}
          onInput={handleTitleInput}
          autoHeight
          confirmType="next"
          onConfirm={() => {
            contentRef.current?.focus?.();
          }}
        />
        <Textarea
          ref={contentRef}
          className="contentInput"
          placeholder="正文内容..."
          placeholderClass="contentPlaceholder"
          value={content}
          onInput={(e) => setContent(e.detail.value)}
          autoHeight
          cursorSpacing={100}
          adjustPosition
        />
      </View>

      <View
        className={`submitBtn ${submitting ? "submitBtn--disabled" : ""}`}
        onClick={handleSubmit}
      >
        {submitting ? "发布中..." : "发布"}
      </View>
    </View>
  );
}
