import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";

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

export function getHotNodes(): Promise<HotNodes[]> {
  return request("/").then(({ body }) => {
    return getDataFromHtml(body, domStructure) as HotNodes[];
  });
}
