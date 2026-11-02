export const AI_USERNAME = 'huanxituo';
export const AI_USER_LABEL = '过早客 Ai';

export const isAiUser = (username?: string): boolean => username === AI_USERNAME;

export function usernameFromUserLink(link?: string): string {
  const value = link?.match(/\/u\/([^/?#]+)/)?.[1];
  if (!value) return '';
  try { return decodeURIComponent(value); } catch { return ''; }
}
