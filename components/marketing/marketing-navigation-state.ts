export const marketingNavigationItems = [
  { label: "Free resume scan", href: "/scan", pagePath: "/scan" },
  {
    label: "How it works",
    href: "/#how-it-works",
    sectionId: "how-it-works",
  },
  { label: "Features", href: "/#features", sectionId: "features" },
  {
    label: "Pricing",
    href: "/#pricing",
    pagePath: "/pricing",
    sectionId: "pricing",
  },
] as const;

export type MarketingNavigationHref =
  (typeof marketingNavigationItems)[number]["href"];

export type MarketingNavCurrentState = {
  href: MarketingNavigationHref;
  ariaCurrent: "page" | "location";
};

const homepageSectionHrefs = new Map<string, MarketingNavigationHref>([
  ["#how-it-works", "/#how-it-works"],
  ["#features", "/#features"],
  ["#pricing", "/#pricing"],
]);

export const marketingSectionIds = [
  "how-it-works",
  "features",
  "pricing",
] as const;

function normalizeHash(hash: string) {
  if (!hash) return "";
  return hash.startsWith("#") ? hash.toLowerCase() : `#${hash.toLowerCase()}`;
}

export function getMarketingNavCurrentState(
  pathname: string,
  activeHash: string,
): MarketingNavCurrentState | null {
  if (pathname === "/") {
    const sectionHref = homepageSectionHrefs.get(normalizeHash(activeHash));
    return sectionHref
      ? { href: sectionHref, ariaCurrent: "location" }
      : null;
  }

  const routeItem = marketingNavigationItems.find(
    (item) =>
      "pagePath" in item &&
      (pathname === item.pagePath || pathname.startsWith(`${item.pagePath}/`)),
  );

  return routeItem
    ? { href: routeItem.href, ariaCurrent: "page" }
    : null;
}
