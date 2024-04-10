import { HTMLElement } from "node-html-parser";

export type DataDomMeta = {
  _selector: string;
  _type: 'object' | 'string' | 'html';
  _attribute: string;
} | {
  _selector: string;
  _type: 'array';
  _item: string;
  _attribute: string;
}

export type DataDom<T extends Record<string, any> | string | any[] = any> =
  T extends string ?
    DataDomMeta
    :
    DataDomMeta & {
    -readonly [P in keyof T]: T[P] extends (infer E)[] ? DataDom<E>: DataDom<T[P]>;
  }

export function getDataFromHtml<T = any>(element: HTMLElement | null | undefined, dataDom: DataDom<T>):
  T {
  if (!element || !dataDom) {
    return undefined;
  }

  const {_selector, _type, _attribute, ...rest} = dataDom;

  let data: Record<string, any> | string | any[];
  if (_type === 'object') {
    data = {};
    const rootDom = _selector ? element.querySelector(_selector) : element;
    const properties = Object.entries(rest);
    properties.forEach(([k, v]) => {

      data[k] = getDataFromHtml(rootDom, v as DataDom);
    })

  } else if (_type === 'array') {
    data = [];
    const itemDoms = element.querySelectorAll(_selector);
    const {_item, ...r} = dataDom;
    itemDoms.forEach((dom) => {
      (data as any[]).push(
        getDataFromHtml(dom, {
          ...r,
          _selector: '',
          _type: _item as any as DataDom['_type'],
        }))
    })
  } else if (_type === 'html') {
    const dom = element.querySelector(_selector);
    data = dom?.toString() || '';
  } else {
    const dom = _selector ? element.querySelector(_selector) : element;

    if (_attribute) {
      data = dom?.getAttribute(_attribute) || '';
    } else {
      data = dom?.text || '';
    }
  }
  return data;
}
