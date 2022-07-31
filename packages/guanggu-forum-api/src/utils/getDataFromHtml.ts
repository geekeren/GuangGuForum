import { HTMLElement } from "node-html-parser";

type Key = `_${string}` | string;

export interface DataDom extends Record<Key, DataDom | string> {
  _selector: string;
  _type: 'object' | 'array' | 'string' | 'html';
  _attribute: string;
}


export function getDataFromHtml(element: HTMLElement | null | undefined, dataDom: DataDom):
  Record<string, any> | string | any[] | undefined {
  if (!element || !dataDom) {
    return undefined;
  }

  const {_selector, _type, _attribute, _item, ...rest} = dataDom;

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
    itemDoms.forEach((dom) => {
      (data as any[]).push(
        getDataFromHtml(dom, {
          ...dataDom,
          _selector: '',
          _type: _item as DataDom['_type'],
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
