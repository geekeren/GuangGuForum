import { request } from "../client"
import { URLS } from "../urls"
import { parseCookie } from "../utils/cookie";
import { DataDom, getDataFromHtml } from "../utils/getDataFromHtml";

interface Xsrf {
    xsrf_cookie: string;
    xsrf_form: string;
}

const domStructure: DataDom<string> = {
    _type: 'string',
    _selector: 'form input[name="_xsrf"]',
    _attribute: 'value',
}


export const getLoginXsrfCode = (): Promise<Xsrf> => {
    return request(URLS.Login, { useCookie: false })
        .then(({ body, rawRes }) => {
            const parsedCookie = parseCookie(rawRes.cookies)
            return Promise.resolve({
                xsrf_cookie: parsedCookie._xsrf.value,
                xsrf_form: getDataFromHtml(body, domStructure) as any as string,
            })
        });
};