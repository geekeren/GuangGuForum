export type Cookie = Record<string, string> & {
    value: string;
    expires?: string;
}
export const parseCookie = (cookies?: string[]): Record<string, Cookie>=> {
    const cookieItems:  Record<string, Cookie> = {};
    (cookies || []).forEach((cookie) => {
        const items = cookie.split(';')
        let cookieName;
        items.forEach((item, index) => {
            const equalIndex = item.indexOf('=');
            const key = item.slice(0, equalIndex);
            const value = item.slice(equalIndex+ 1);

            if (index === 0) {
                cookieName = key.trim();
                cookieItems[cookieName] = {
                    value,
                }
            } else {
                cookieItems[cookieName][key] = value
            }
        })
    })
    return cookieItems;
}

export function stringifyCookie(cookies: Record<string, Cookie>): string {
    return Object.entries(cookies).map(([k, v]) =>(
        `${k}=${v.value}`
    )).join('; ')
}