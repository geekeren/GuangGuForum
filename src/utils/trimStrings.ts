/** 递归清理对象中所有字符串值的首尾空格 */
export function trimStrings<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.trim() as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(trimStrings) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      result[key] = trimStrings((obj as Record<string, any>)[key]);
    }
    return result as T;
  }
  return obj;
}
