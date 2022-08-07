import { match, compile } from 'path-to-regexp';
import url from 'url';

export const urlPathVaiable = (urlPattern: string) => {
    return (link: string) => match(
        urlPattern, {
        decode: decodeURIComponent,
    })(url.parse(link).pathname || '')
};

export const getUrl = (
    urlPattern: string, pathVariable: Record<string, string>
) => compile(urlPattern, { encode: encodeURIComponent })(pathVariable);