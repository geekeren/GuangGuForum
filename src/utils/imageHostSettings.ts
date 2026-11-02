export function isValidImgUrlToken(token: string): boolean {
  return token.length > 0 && token.length <= 4096 && !/\s/.test(token);
}
