import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";

export interface HotNodes {
  title: string;
  link: string;
}

const domStructure: DataDom<HotNodes> = {
  _attribute: "",
  _type: "array",
  _item: "object",
  _selector: ".hot-nodes .ui-content a",
  title: {
    _selector: "",
    _attribute: "",
    _type: "string",
  },
  link: {
    _selector: "",
    _attribute: "href",
    _type: "string",
  },
};

export const getHotNodes: CacheAPIFunc<void, HotNodes[]> = (
  _params?,
  options?,
) => {
  const cache = options?.cache ?? true;
  return request("/", {
    cache,
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(getDataFromHtml(body, domStructure) as HotNodes[])
      : undefined,
  }).then(({ body }) => {
    return getDataFromHtml(body, domStructure) as HotNodes[];
  });
};
