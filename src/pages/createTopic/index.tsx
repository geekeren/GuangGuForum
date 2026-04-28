import { View, Text, Textarea, Picker } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useState, useEffect } from "react";
import { createTopic, NodeGroup } from "guanggu-forum-api";
import {
  getCachedNodeNavigation,
  fetchAndCacheNodeNavigation,
} from "../../utils/nodeNavigation";
import "./index.scss";

const LAST_NODE_KEY = "last_selected_node";

export default function CreateTopic() {
  const [nodeGroups, setNodeGroups] = useState<NodeGroup[]>([]);
  const [pickerValue, setPickerValue] = useState<[number, number]>([0, 0]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const restorePicker = (groups: NodeGroup[], preferNodeSlug?: string) => {
    // 优先选中 URL 传入的节点
    if (preferNodeSlug) {
      for (let gi = 0; gi < groups.length; gi++) {
        const ni = groups[gi].nodes.findIndex((n) => n.slug === preferNodeSlug);
        if (ni >= 0) {
          setPickerValue([gi, ni]);
          return;
        }
      }
    }
    // 否则恢复上次选择
    try {
      const saved = Taro.getStorageSync(LAST_NODE_KEY);
      if (saved) {
        const { groupIndex, nodeIndex } = JSON.parse(saved);
        if (groupIndex < groups.length && nodeIndex < (groups[groupIndex]?.nodes?.length || 0)) {
          setPickerValue([groupIndex, nodeIndex]);
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

  const currentGroup = nodeGroups[pickerValue[0]];
  const currentNode = currentGroup?.nodes?.[pickerValue[1]];

  const handleSubmit = async () => {
    if (!currentNode) {
      Taro.showToast({ title: "请选择节点", icon: "none" });
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
        node: currentNode.slug,
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
      <View className="section">
        <Text className="label">标题</Text>
        <View className="inputWrap">
          <Textarea
            className="titleInput"
            placeholder="请输入标题"
            maxlength={120}
            value={title}
            onInput={(e) => setTitle(e.detail.value)}
            autoHeight
          />
        </View>
      </View>

      <View className="section">
        <Text className="label">节点</Text>
        <Picker
          mode="multiSelector"
          range={[nodeGroups.map((g) => g.category), currentGroup?.nodes?.map((n) => n.name) || []]}
          value={pickerValue}
          onChange={(e) => {
            const val = e.detail.value as [number, number];
            setPickerValue(val);
            try {
              Taro.setStorageSync(LAST_NODE_KEY, JSON.stringify({ groupIndex: val[0], nodeIndex: val[1] }));
            } catch {}
          }}
          onColumnChange={(e) => {
            const { column, value } = e.detail;
            if (column === 0) {
              setPickerValue([value, 0]);
            } else {
              setPickerValue([pickerValue[0], value]);
            }
          }}
        >
          <View className="pickerItem">
            <Text>{currentNode ? `${currentGroup.category} - ${currentNode.name}` : "选择节点"}</Text>
            <Text className="arrow">▼</Text>
          </View>
        </Picker>
      </View>

      <View className="section">
        <Text className="label">内容</Text>
        <View className="inputWrap">
          <Textarea
            className="contentInput"
            placeholder="请输入内容"
            value={content}
            onInput={(e) => setContent(e.detail.value)}
            cursorSpacing={100}
            adjustPosition
          />
        </View>
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
