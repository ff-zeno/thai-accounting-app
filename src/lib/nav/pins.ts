import { navCategories, type NavItem } from "./structure";

/** Every nav item flattened out of the tier-1/tier-2 structure. */
const allNavItems: NavItem[] = navCategories.flatMap((category) =>
  category.sections.flatMap((section) => section.items)
);

const navItemsByHref = new Map(allNavItems.map((item) => [item.href, item]));

/** True when the href points at a real item in the nav structure. */
export function isKnownNavHref(href: string): boolean {
  return navItemsByHref.has(href);
}

/**
 * Resolve pinned hrefs to nav items, preserving pin order and silently
 * dropping hrefs that no longer exist in the nav structure (stale pins to
 * removed routes).
 */
export function resolvePinnedNavItems(hrefs: string[]): NavItem[] {
  return hrefs
    .map((href) => navItemsByHref.get(href))
    .filter((item): item is NavItem => item !== undefined);
}
