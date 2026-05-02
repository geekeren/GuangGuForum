import { View, Text, Picker, Radio, RadioGroup } from "@tarojs/components";
import { ClearableTextarea } from "../../../components/ClearableInput";
import { BRAND_COLOR } from "../../../utils/theme";
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
    return `## 👤 基本信息\n\n- 性别：${fields.gender}\n- 年龄：${age}\n\n## 💕 期望\n\n${fields.requirements}\n\n## ✍️ 自我介绍\n\n${content}\n\n\n\n${fromMini}`;
  },

  validate(fields) {
    const age = fields.birthYear ? String(new Date().getFullYear() - parseInt(fields.birthYear)) : "";
    if (!fields.gender?.trim() || !age.trim()) {
      return "请填写基本信息";
    }
    return null;
  },

  renderForm(ctx: RenderFormContext) {
    const { fields, setField, title, content, setContent, getRef, focusRef, handleTitleInput } = ctx;
    const titleRef = getRef("title");
    const requirementsRef = getRef("requirements");
    const contentRef = getRef("content");
    const age = fields.birthYear ? String(new Date().getFullYear() - parseInt(fields.birthYear)) : "";

    return (
      <View className="editorSection">
        <ClearableTextarea
          ref={titleRef}
          className="titleInput"
          placeholder="一句话介绍自己"
          placeholderClass="titlePlaceholder"
          cursorColor={BRAND_COLOR}
          maxlength={120}
          value={title}
          onInput={handleTitleInput}
          autoHeight
          confirmType="next"
          onConfirm={() => focusRef(requirementsRef)}
          onDeleteWhenEmpty={() => focusRef(requirementsRef)}
        />
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
                  {g}
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
            onDeleteWhenEmpty={() => focusRef(titleRef)}
          />
        </View>
        <ClearableTextarea
          ref={contentRef}
          className="contentInput"
          placeholder="自我介绍..."
          placeholderClass="contentPlaceholder"
          cursorColor={BRAND_COLOR}
          value={content}
          onInput={(v) => setContent(v)}
          autoHeight
          cursorSpacing={100}
          adjustPosition
          onDeleteWhenEmpty={() => focusRef(requirementsRef)}
        />
      </View>
    );
  },

  onActivate(ctx: OnActivateContext) {
    return ctx.getRef("requirements");
  },
};

export default datingDef;
