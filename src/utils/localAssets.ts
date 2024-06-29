import defaultAvatar from "../assets/m_default.png";

export const getFromLocalCache = (url: string) => {
  if (url.endsWith("/m_default.png")) {
    return defaultAvatar;
  }
  return url;
};
