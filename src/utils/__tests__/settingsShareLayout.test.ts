import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/settings/index.tsx", "utf8");
const styles = readFileSync("src/pages/settings/index.scss", "utf8");

describe("settings share row layout", () => {
  it("keeps native sharing and uses a full-width content row in both renderers", () => {
    const button = source.split("<Button className='settingsItemBtn' open-type='share'>")[1].split("</Button>")[0];
    expect(button).toContain("<View className='settingsItemBtnContent'>");
    expect(button).toContain("<View className='settingsItemLeft'>");
    expect(button).toContain("className='settingsItemArrow'");
    const content = styles.split(".settingsItemBtnContent {")[1].split("}")[0];
    expect(content).toContain("width: 100%;");
    expect(content).toContain("display: flex;");
    expect(content).toContain("flex-direction: row;");
    expect(content).toContain("align-items: center;");
    expect(content).toContain("justify-content: space-between;");
    expect(styles).not.toContain(".settingsPage--skyline .settingsItemBtn");
  });
  it("lets the label fill the row while keeping the arrow at its normal size", () => {
    const left = styles.split(".settingsItemLeft {")[1].split("}")[0];
    expect(left).toContain("flex: 1;");
    const arrow = styles.split(".settingsItemArrow {")[1].split("}")[0];
    expect(arrow).toContain("flex-shrink: 0;");
    expect(arrow).toContain("width: 28rpx;");
    expect(arrow).toContain("height: 28rpx;");
  });
});
