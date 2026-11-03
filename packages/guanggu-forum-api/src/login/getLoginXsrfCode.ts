import { request } from "../client";
import { URLS } from "../urls";
import { parseCookie } from "../utils/cookie";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";

interface Xsrf {
  xsrf_cookie: string;
  xsrf_form: string;
}

const domStructure: DataDom<string> = {
  _type: "string",
  _selector: 'form input[name="_xsrf"]',
  _attribute: "value",
};

export const getLoginXsrfCode = (): Promise<Xsrf> => {
  return request(URLS.Login, { useCookie: false }).then(({ body, rawRes }) => {
    const xsrfForm = getDataFromHtml<string>(body, domStructure);
    if (typeof xsrfForm !== "string" || !xsrfForm.trim()) {
      throw new Error("无法获取安全校验信息，请重试");
    }
    const parsedCookie = parseCookie(rawRes?.cookies);
    return {
      // The server may reuse its session without sending a new cookie. Never invent one.
      xsrf_cookie: parsedCookie._xsrf?.value || "",
      xsrf_form: xsrfForm,
    };
  });
};
