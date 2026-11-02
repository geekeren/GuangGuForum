import { View } from "@tarojs/components";
import { ClearableTextarea } from "../../../components/ClearableInput";
import { BRAND_COLOR } from "../../../utils/theme";
import type { TopicTypeDefinition, RenderFormContext } from "./registry";

const normalDef: TopicTypeDefinition = {
  key: "normal",
  label: "普通",
  node: null,

  initialFields: {},

  buildContent(_fields, { content, fromMini }) {
    return `${content}${fromMini}`;
  },

  validate() {
    return null;
  },

  renderForm(ctx: RenderFormContext) {
    const { title, getRef, focusRef, handleTitleInput, renderContentInput } = ctx;
    const titleRef = getRef("title");
    const contentRef = getRef("content");

    return (
      <View className="editorSection">
        <ClearableTextarea
          ref={titleRef}
          className="titleInput"
          placeholder="标题"
          placeholderClass="titlePlaceholder"
          cursorColor={BRAND_COLOR}
          maxlength={120}
          value={title}
          onInput={handleTitleInput}
          autoHeight
          confirmType="next"
          onConfirm={() => focusRef(contentRef)}
          onDeleteWhenEmpty={() => focusRef(contentRef)}
        />
        {renderContentInput('正文内容...', titleRef)}
      </View>
    );
  },
};

export default normalDef;
