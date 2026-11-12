export type HomeRailMode = 'none' | 'icons' | 'labels' | 'community';
export const HOME_RAIL_WIDTHS = { none: 0, icons: 60, labels: 160, community: 200 } as const;

/** Device identity enables the rail; only the owning page's width chooses its density. */
export function getHomeRailMode(isDesktopClient: boolean, pageWidth: number): HomeRailMode {
  if (!isDesktopClient) return 'none';
  if (pageWidth < 640) return 'icons';
  if (pageWidth < 960) return 'labels';
  return 'community';
}
