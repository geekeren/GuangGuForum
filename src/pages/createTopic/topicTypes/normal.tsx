import { View } from "@tarojs/components";
import TopicTitle from '../TopicTitle';
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
        <TopicTitle inputRef={titleRef} editorRef={contentRef} value={title} onInput={handleTitleInput} onNext={() => focusRef(contentRef)} />
        {renderContentInput('说说你的看法、经验或问题...', titleRef)}
      </View>
    );
  },
};

export default normalDef;
