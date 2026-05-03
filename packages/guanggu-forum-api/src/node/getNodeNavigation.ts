import { request } from "../client";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";
import { CacheAPIFunc } from "../types";

export interface NodeGroup {
  category: string;
  nodes: NodeItem[];
}

export interface NodeItem {
  name: string;
  slug: string;
}

const nodeGroupDom: DataDom<NodeGroup> = {
  _selector: ".nodes-cloud ul li",
  _attribute: "",
  _type: "array",
  _item: "object",
  category: {
    _selector: "label",
    _attribute: "",
    _type: "string",
  },
  nodes: {
    _selector: ".nodes a",
    _attribute: "",
    _type: "array",
    _item: "object",
    name: {
      _selector: "",
      _attribute: "",
      _type: "string",
    },
    slug: {
      _selector: "",
      _attribute: "href",
      _type: "string",
    },
  },
};

function parseGroups(body: any): NodeGroup[] {
  const groups = getDataFromHtml(body, nodeGroupDom) as NodeGroup[];
  return groups.map((g) => ({
    category: g.category,
    nodes: g.nodes.map((n) => ({
      name: n.name,
      slug: n.slug.replace("/node/", ""),
    })),
  }));
}

export const getNodeNavigation: CacheAPIFunc<void, NodeGroup[]> = (
  _params?,
  options?,
) => {
  const cache = options?.cache ?? true;
  return request("/", {
    cache,
    onRefresh: options?.onRefresh
      ? (body) => options.onRefresh!(parseGroups(body))
      : undefined,
  }).then(({ body }) => parseGroups(body));
};
