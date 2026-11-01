import { describe, it, expect } from "vitest";
import { buildSearchRoute, decodeSearchRouteValue, getPlaceholderTopicRoute } from "../searchRoute";

describe("search entry route", () => {
  it("opens the exact rotating topic only for an empty keyword", () => {
    expect(getPlaceholderTopicRoute("", { topicLink: "/t/123" })).toBe("/pages/topicDetail/index?tid=123");
    expect(getPlaceholderTopicRoute("  ", { topicLink: "/t/456#r789" })).toBe("/pages/topicDetail/index?tid=456");
    expect(getPlaceholderTopicRoute("租房", { topicLink: "/t/123" })).toBeUndefined();
    expect(getPlaceholderTopicRoute("")).toBeUndefined();
    expect(getPlaceholderTopicRoute("", { topicLink: "https://example.com/t/123" })).toBeUndefined();
  });
  it("preserves the homepage destination", () => {
    expect(buildSearchRoute()).toBe("/pages/search/index");
  });
  it("encodes board parameters and decodes native route values exactly once", () => {
    const route = buildSearchRoute("house", "楼市房产 & 家");
    expect(route).toContain("node=house&nodeName=");
    expect(decodeSearchRouteValue(route.split("nodeName=")[1])).toBe("楼市房产 & 家");
    expect(decodeSearchRouteValue("%25")).toBe("%");
  });
  it("handles unencoded names, missing values and invalid escapes", () => {
    expect(decodeSearchRouteValue("楼市房产")).toBe("楼市房产");
    expect(decodeSearchRouteValue()).toBe("");
    expect(decodeSearchRouteValue("100%完工")).toBe("100%完工");
  });
});
