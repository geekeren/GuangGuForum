import { View, Text } from "@tarojs/components";
import { GzkPicker as Picker, GzkRadio as Radio, GzkRadioGroup as RadioGroup } from "gzk-ui/native-form";
import { ClearableTextarea } from "../../../components/ClearableInput";
import TopicTitle from '../TopicTitle';
import { BRAND_COLOR } from "../../../utils/theme";
import { escapeTopicHtml } from '../../../utils/topicDocument';
import type { TopicTypeDefinition, RenderFormContext, OnActivateContext } from "./registry";

const GENDER_OPTIONS = ["男", "女"];

const datingDef: TopicTypeDefinition = {
  key: "dating",
  label: "相亲贴",
  node: "date",
  hiddenNodes: ["date"],

  initialFields: {
    gender: "",
    birthYear: "",
    requirements: "",
  },

  buildContent(fields, { content, fromMini }) {
    const age = fields.birthYear ? String(new Date().getFullYear() - parseInt(fields.birthYear)) : "";
    return `<h2>👤 基本信息</h2><ul><li>性别：${escapeTopicHtml(fields.gender || '')}</li><li>年龄：${escapeTopicHtml(age)}</li></ul><h2>💕 期望</h2><p>${escapeTopicHtml(fields.requirements || '').replace(/\n/g, '<br />')}</p><h2>✍️ 自我介绍</h2>${content}${fromMini}`;
  },

  validate(fields) {
    const age = fields.birthYear ? String(new Date().getFullYear() - parseInt(fields.birthYear)) : "";
    if (!fields.gender?.trim() || !age.trim()) {
      return "请填写基本信息";
    }
    return null;
  },

  renderForm(ctx: RenderFormContext) {
    const { fields, setField, title, getRef, focusRef, handleTitleInput, renderContentInput } = ctx;
    const titleRef = getRef("title");
    const requirementsRef = getRef("requirements");
    const age = fields.birthYear ? String(new Date().getFullYear() - parseInt(fields.birthYear)) : "";

    return (
      <View className="editorSection">
        <TopicTitle inputRef={titleRef} editorRef={getRef('content')} value={title} onInput={handleTitleInput} onNext={() => focusRef(requirementsRef)} />
        <View className="fieldRow">
          <View className="fieldGroup fieldGroup--inline fieldGroup--half">
            <Text className="fieldLabel">性别</Text>
            <RadioGroup onChange={(e) => setField("gender", e.detail.value)} className="genderRadio">
              {GENDER_OPTIONS.map((g) => (
                <Radio
                  key={g}
                  value={g}
                  checked={fields.gender === g}
                  color={BRAND_COLOR}
                  className="genderRadioItem"
                >
                  <Text>{g}</Text>
                </Radio>
              ))}
            </RadioGroup>
          </View>
          <View className="fieldGroup fieldGroup--inline fieldGroup--half">
            <Text className="fieldLabel">年龄</Text>
            <Picker
              mode="date"
              fields="year"
              value={fields.birthYear || "2000"}
              onChange={(e) => setField("birthYear", e.detail.value)}
            >
              <View className="fieldPicker">
                <Text className={age ? "fieldPickerText" : "fieldPickerText fieldPickerText--placeholder"}>
                  {age ? `${age}岁` : "选择出生年"}
                </Text>
                <Text className="fieldPickerArrow">▼</Text>
              </View>
            </Picker>
          </View>
        </View>
        <View className="fieldGroup">
          <Text className="fieldLabel">期望对象</Text>
          <ClearableTextarea
            ref={requirementsRef}
            className="fieldTextarea"
            placeholder="对另一半的期望..."
            placeholderClass="fieldPlaceholder"
            cursorColor={BRAND_COLOR}
            value={fields.requirements}
            onInput={(v) => setField("requirements", v)}
            autoHeight
            showConfirmBar={false}
            onDeleteWhenEmpty={() => focusRef(titleRef)}
          />
        </View>
        {renderContentInput('自我介绍...', requirementsRef)}
      </View>
    );
  },

  onActivate(ctx: OnActivateContext) {
    return ctx.getRef("requirements");
  },
};

export default datingDef;
