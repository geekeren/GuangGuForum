import { View, Text, Picker } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ClearableInput, ClearableTextarea } from "../../../components/ClearableInput";
import { BRAND_COLOR } from "../../../utils/theme";
import { escapeTopicHtml } from '../../../utils/topicDocument';
import type { TopicTypeDefinition, RenderFormContext, OnActivateContext } from "./registry";

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const eventDef: TopicTypeDefinition = {
  key: "event",
  label: "活动",
  node: "lowshine",
  hiddenNodes: ["lowshine"],

  initialFields: {
    eventDate: "",
    eventHour: "",
    eventLocation: "",
  },

  buildContent(fields, { content, fromMini }) {
    const eventTime = [fields.eventDate, fields.eventHour].filter(Boolean).join(" ");
    return `<h2>📅 活动信息</h2><ul><li>时间：${escapeTopicHtml(eventTime)}</li><li>地点：${escapeTopicHtml(fields.eventLocation || '')}</li></ul><h2>📋 活动详情</h2>${content}${fromMini}`;
  },

  validate(fields) {
    const eventTime = [fields.eventDate, fields.eventHour].filter(Boolean).join(" ");
    if (!eventTime.trim() || !fields.eventLocation?.trim()) {
      return "请填写活动时间和地点";
    }
    return null;
  },

  renderForm(ctx: RenderFormContext) {
    const { fields, setField, title, getRef, focusRef, handleTitleInput, renderContentInput } = ctx;
    const titleRef = getRef("title");
    const eventLocationRef = getRef("eventLocation");

    return (
      <View className="editorSection">
        <ClearableTextarea
          ref={titleRef}
          className="titleInput"
          placeholder="活动名称"
          placeholderClass="titlePlaceholder"
          cursorColor={BRAND_COLOR}
          maxlength={120}
          value={title}
          onInput={handleTitleInput}
          autoHeight
          confirmType="next"
          onConfirm={() => focusRef(eventLocationRef)}
          onDeleteWhenEmpty={() => focusRef(eventLocationRef)}
        />
        <View className="fieldGroup fieldGroup--inline">
          <Text className="fieldLabel">活动时间</Text>
          <Picker
            mode="date"
            value={fields.eventDate || formatDate(new Date())}
            onChange={(e) => setField("eventDate", e.detail.value)}
          >
            <View className="fieldPicker">
              <Text className={fields.eventDate ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                {fields.eventDate || "选择日期"}
              </Text>
              <Text className="fieldPickerArrow">▼</Text>
            </View>
          </Picker>
          <Picker
            mode="time"
            value={fields.eventHour || "09:00"}
            onChange={(e) => setField("eventHour", e.detail.value)}
          >
            <View className="fieldPicker">
              <Text className={fields.eventHour ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                {fields.eventHour || "选择时间"}
              </Text>
              <Text className="fieldPickerArrow">▼</Text>
            </View>
          </Picker>
        </View>
        <View className="fieldGroup">
          <Text className="fieldLabel">活动地点</Text>
          <View className="locationRow">
            <ClearableInput
              ref={eventLocationRef}
              className="fieldInput fieldInput--location"
              placeholder="线下地址或线上链接"
              placeholderClass="fieldPlaceholder"
              cursorColor={BRAND_COLOR}
              value={fields.eventLocation}
              onInput={(v) => setField("eventLocation", v)}
              onDeleteWhenEmpty={() => focusRef(titleRef)}
            />
            <View className="locationBtn" onClick={() => {
              Taro.chooseLocation({
                success: (res) => setField("eventLocation", res.name || res.address),
                fail: () => {},
              });
            }}>
              <Text className="locationBtnText">定位</Text>
            </View>
          </View>
        </View>
        {renderContentInput('活动详情...', eventLocationRef)}
      </View>
    );
  },

  onActivate(ctx: OnActivateContext) {
    return ctx.getRef("eventLocation");
  },
};

export default eventDef;
