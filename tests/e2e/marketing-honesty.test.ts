import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("public marketing claims", () => {
  const publicCopy = [
    "app/(marketing)/page.tsx",
    "app/(marketing)/waitlist/page.tsx",
    "app/(marketing)/waitlist/confirmation/page.tsx",
    "app/(marketing)/pricing/page.tsx",
    "app/(marketing)/terms/page.tsx",
    "components/marketing/FeatureTabs.tsx",
  ]
    .map(read)
    .join("\n");

  it.each([
    ["guaranteed ATS outcome", /guaranteed\s+(?:ats|90)/i],
    ["universal ATS compatibility", /every\s+ats/i],
    ["unsupported speed promise", /(?:under one minute|in seconds)/i],
    ["fabricated waitlist count", /\+500/],
    ["unsupported compliance claim", /soc\s*2/i],
    ["stale launch date", /q3\s+2025/i],
    ["fabricated numeric product score", /(?:ats score\s*:\s*\d|94\s*\/\s*100|90\+)/i],
  ])("does not publish a %s", (_label, pattern) => {
    expect(publicCopy).not.toMatch(pattern);
  });

  it("routes the public get-started page to account creation without a dead form", () => {
    const getStarted = read("app/(marketing)/waitlist/page.tsx");

    expect(getStarted).toContain('href="/signup"');
    expect(getStarted).not.toMatch(/<form\b/i);
  });

  it("renders a waitlist number only when a positive position is supplied", () => {
    const confirmation = read("app/(marketing)/waitlist/confirmation/page.tsx");

    expect(confirmation).toContain("const resolvedSearchParams = await searchParams");
    expect(confirmation).toContain('resolvedSearchParams?.position ?? ""');
    expect(confirmation).toContain('position ? `#${position}` : "Saved"');
  });

  it("does not advertise subscriptions or limits that are not implemented", () => {
    const pricing = read("app/(marketing)/pricing/page.tsx");
    const terms = read("app/(marketing)/terms/page.tsx");

    expect(pricing).toMatch(/Paid plans are not live yet/i);
    expect(pricing).not.toMatch(
      /Get Pro Access|Unlimited Resumes|3 Resumes \/ month|Save 20%|billed annually/i,
    );
    expect(terms).not.toMatch(/Pro subscribers are billed/i);
  });
});
