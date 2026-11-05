/** Registered page paths. Presentation labels and account identities never affect routing. */
export const APP_ROUTES = {
  home: '/pages/home/index',
  settings: '/pages/secondary/settings/index',
  imageSettings: '/pages/secondary/settings/image-setting',
  editProfile: '/pages/secondary/settings/edit-profile',
  messages: '/pages/secondary/messages/index',
  messageThread: '/pages/secondary/messages/thread',
} as const;
