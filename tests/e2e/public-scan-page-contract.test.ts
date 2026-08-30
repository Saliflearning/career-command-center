import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("public resume scan page contract", () => {
  it("exposes the scan from the marketing navigation and home page", () => {
    const navigation = read(
      "components/marketing/marketing-navigation-state.ts",
    );
    const home = read("app/(marketing)/page.tsx");

    expect(navigation).toMatch(/href: "\/scan"/);
    expect(navigation).toMatch(/Free resume scan/);
    expect(home).toMatch(/href="\/scan"/);
    expect(home).toMatch(/Scan your resume free/);
  });

  it("uses route-safe marketing links from the scan page", () => {
    const navigation = read(
      "components/marketing/marketing-navigation-state.ts",
    );

    expect(navigation).toMatch(/href: "\/#how-it-works"/);
    expect(navigation).toMatch(/href: "\/#features"/);
    expect(navigation).toMatch(/href: "\/#pricing"/);
    expect(navigation).not.toMatch(
      /href="#(?:how-it-works|features|pricing)"/,
    );
  });

  it("keeps pricing in the homepage journey and links to full plan details", () => {
    const home = read("app/(marketing)/page.tsx");
    const footer = read("components/marketing/MarketingFooter.tsx");

    expect(home).toMatch(/id="pricing"/);
    expect(home).toMatch(/href="\/pricing"/);
    expect(home).toMatch(/View full pricing/);
    expect(footer).toMatch(/href: "\/#pricing"/);
  });

  it("makes the current marketing page visible and accessible on every menu", () => {
    const navigation = read("components/marketing/MarketingNav.tsx");

    expect(navigation).toMatch(/usePathname/);
    expect(navigation).toMatch(/aria-current/);
    expect(navigation).toMatch(/hashchange/);
    expect(navigation).toMatch(/popstate/);
    expect(navigation).toMatch(/scrollIntoView/);
    expect(navigation).toMatch(/hashNavigationInProgress/);
    expect(navigation).toMatch(
      /if \(linkedSection\.hash\) \{\s*setActiveHash\(linkedSection\.hash\)/,
    );
    expect(navigation).toMatch(/getMarketingNavCurrentState/);
    expect(navigation).toMatch(/border-secondary/);
    expect(navigation).toMatch(/bg-secondary\/10/);
    expect(navigation).toMatch(/absolute inset-x-0 top-full/);
    expect(navigation).toMatch(/event\.preventDefault\(\)/);
    expect(navigation).toMatch(/window\.location\.hash = targetHash/);
    expect(navigation).toMatch(/mobileOpenRef\.current/);
    expect(navigation).toMatch(/setActiveHash\(linkedHash\)/);
  });

  it("leads with one alignment score and keeps diagnostics secondary", () => {
    const page = read("app/(marketing)/scan/page.tsx");
    const client = read("components/marketing/PublicResumeScan.tsx");

    expect(page).toMatch(/Free Resume Scan/);
    expect(client).toMatch(/\/api\/public\/resume-scan/);
    expect(client).toMatch(/not saved/i);
    expect(client).toMatch(/Current resume alignment/);
    expect(client).toMatch(/Secondary diagnostics/);
    expect(client).toMatch(/ATS readiness/);
    expect(client).toMatch(/Evidence strength/);
    expect(client).not.toMatch(/<ScoreGauge label="Requirement coverage"/);
    expect(client).not.toMatch(/<ScoreGauge label="High-signal coverage"/);
    expect(client).toMatch(/Requirement evidence/);
    expect(client).toMatch(/Resume evidence/);
    expect(client).toMatch(/Requirements demonstrated/);
    expect(client).toMatch(/How scores are calculated/);
    expect(client).toMatch(/Scan another resume/);
  });

  it("asks at most three evidence questions and never projects from a bare yes", () => {
    const client = read("components/marketing/PublicResumeScan.tsx");
    const projection = read("lib/resume/scan-projection.ts");

    expect(client).toMatch(/slice\(0, 3\)/);
    expect(client).toMatch(/I have this/);
    expect(client).toMatch(/Not part of my experience/);
    expect(client).toMatch(/Not sure/);
    expect(client).toMatch(/Where did you use it\?/);
    expect(client).toMatch(/What did you do\?/);
    expect(client).toMatch(/completedEvidenceTerms/);
    expect(projection).toMatch(/MIN_EVIDENCE_EXAMPLE_CHARS/);
    expect(projection).toMatch(/context\.trim\(\)/);
    expect(projection).toMatch(/example\.trim\(\)/);
  });

  it("keeps actual and projected alignment visibly separate", () => {
    const client = read("components/marketing/PublicResumeScan.tsx");

    expect(client).toMatch(/Projected alignment/);
    expect(client).toMatch(/Your current resume remains at/);
    expect(client).toMatch(/not yet in your resume/i);
    expect(client).toMatch(/aria-live="polite"/);
    expect(client).toMatch(/Build my truthful tailored resume/);
  });

  it("handles edge rate limits and non-JSON firewall responses", () => {
    const client = read("components/marketing/PublicResumeScan.tsx");

    expect(client).toMatch(/response\.status === 429/);
    expect(client).toMatch(/content-type/);
    expect(client).toMatch(/Retry-After/i);
  });

  it("attaches an invisible BotID check to the anonymous scan and verifies it server-side", () => {
    const instrumentation = read("instrumentation-client.ts");
    const route = read("app/api/public/resume-scan/route.ts");
    const nextConfig = read("next.config.mjs");

    expect(instrumentation).toMatch(/initBotId/);
    expect(instrumentation).toMatch(/path: "\/api\/public\/resume-scan"/);
    expect(instrumentation).toMatch(/method: "POST"/);
    expect(route).toMatch(/checkBotId/);
    expect(route).toMatch(/Automated scan requests are not allowed/);
    expect(nextConfig).toMatch(/withBotId\(nextConfig\)/);
  });

  it("does not persist anonymous resume or job-description content in the browser", () => {
    const client = read("components/marketing/PublicResumeScan.tsx");

    expect(client).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/i);
    expect(client).not.toMatch(/posthog|analytics|track\(/i);
  });

  it("does not publish a fabricated service-status claim or prefetch the protected dashboard", () => {
    const footer = read("components/marketing/MarketingFooter.tsx");

    expect(footer).not.toMatch(/ALL SYSTEMS OPERATIONAL/);
    expect(footer).toMatch(/link\.href === "\/dashboard" \? false/);
  });
});
