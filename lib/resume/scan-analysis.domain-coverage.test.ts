// ---------------------------------------------------------------------------
// Domain coverage probe for analyzeResumeAgainstJob.
//
// Product requirement: the scan must work for anybody who signs up, not only
// for operations/logistics candidates.
//
// Every fixture below is a deliberately STRONG resume for its own job: correct
// section headers, contact block, action verbs, quantified outcomes, and heavy
// vocabulary overlap with its own job description. A valid instrument should
// score all of them well. Divergence across domains measures the instrument's
// bias, not the candidates' quality.
//
// All data is synthetic. No real person, employer, or metric appears here.
// ---------------------------------------------------------------------------

import { analyzeResumeAgainstJob } from "./scan-analysis";

type Case = { domain: string; resume: string; jd: string };

const CASES: Case[] = [
  {
    domain: "operations (control - the domain the scorer was tuned on)",
    resume: [
      "ALEX EXAMPLE",
      "City, ST | (317) 555-0100 | alex@example.com | linkedin.com/in/example",
      "PROFESSIONAL EXPERIENCE",
      "Operations Manager | Example Distribution | Jan 2018 - Present",
      "- Led 120 associates across inbound operations while maintaining safety and productivity standards.",
      "- Reduced peak weekly defects 41% by analyzing throughput data and improving workflows.",
      "- Built Python reporting that surfaced site performance trends for weekly KPI reviews.",
      "- Directed team leadership programs and continuous improvement events across the site.",
      "Operations Supervisor | Example Distribution | Jun 2015 - Dec 2017",
      "- Managed daily warehouse throughput and safety audits for a 40-person shift.",
      "EDUCATION",
      "Bachelor of Science, Business | State University",
      "SKILLS",
      "Operations: WMS, warehouse operations, lean operations, continuous improvement, P&L ownership",
    ].join("\n"),
    jd: "Senior Operations Manager. Own warehouse safety, throughput, WMS automation, lean operations, continuous improvement, team leadership, and P&L ownership across the site.",
  },
  {
    domain: "nursing",
    resume: [
      "ALEX EXAMPLE",
      "City, ST | (317) 555-0100 | alex@example.com | linkedin.com/in/example",
      "PROFESSIONAL EXPERIENCE",
      "Registered Nurse | Example Regional Hospital | Mar 2019 - Present",
      "- Managed direct patient care for 18 patients per shift in a 40-bed medical surgical unit.",
      "- Reduced central line infection rates 32% by implementing revised sterile protocols.",
      "- Precepted 12 new graduate nurses and improved first-year retention 25%.",
      "- Administered medications and documented assessments in Epic with 99% accuracy.",
      "Staff Nurse | Example Community Clinic | Jul 2016 - Feb 2019",
      "- Performed triage and patient safety screenings for 40 walk-in patients daily.",
      "EDUCATION",
      "Bachelor of Science in Nursing (BSN) | State University",
      "CERTIFICATIONS",
      "Registered Nurse (RN), active state license | BLS certification, American Heart Association",
      "SKILLS",
      "Clinical: triage, patient assessment, wound care, IV therapy, Epic charting, clinical documentation",
    ].join("\n"),
    jd: "Registered Nurse, medical surgical unit. Provide direct patient care, triage, medication administration, wound care, and clinical documentation in Epic. Requires BSN, active RN license, BLS certification, patient safety focus, and experience precepting new nurses.",
  },
  {
    domain: "software engineering",
    resume: [
      "ALEX EXAMPLE",
      "City, ST | (317) 555-0100 | alex@example.com | github.com/example",
      "PROFESSIONAL EXPERIENCE",
      "Senior Software Engineer | Example Software | Apr 2020 - Present",
      "- Built distributed backend services and microservices in Go serving 40M daily requests.",
      "- Cut p99 API latency 63% by redesigning the caching layer and query patterns for reliability and scalability.",
      "- Migrated 80 microservices to Kubernetes, reducing deploy time from 40 minutes to 4.",
      "- Designed CI/CD pipelines that increased release frequency 5x with zero downtime.",
      "- Led system design reviews and code review standards for a 12-engineer group.",
      "Software Engineer | Example Startup | Aug 2016 - Mar 2020",
      "- Developed REST APIs in Go and TypeScript on AWS with Docker-based deployment.",
      "EDUCATION",
      "Bachelor of Science, Computer Science | State University",
      "SKILLS",
      "Languages: Go, TypeScript, Python. Infrastructure: Kubernetes, Docker, AWS, Terraform, CI/CD",
    ].join("\n"),
    jd: "Senior Backend Engineer. Design and build distributed microservices in Go. Own API latency, reliability, and scalability. Experience with Kubernetes, Docker, CI/CD, and AWS required. Strong system design and code review skills.",
  },
  {
    domain: "accounting",
    resume: [
      "ALEX EXAMPLE",
      "City, ST | (317) 555-0100 | alex@example.com | linkedin.com/in/example",
      "PROFESSIONAL EXPERIENCE",
      "Senior Accountant | Example Financial | Feb 2019 - Present",
      "- Closed monthly books for 6 entities, cutting month-end close time from 12 days to 5.",
      "- Reconciled 400 general ledger accounts and resolved $2.1M in aged variances.",
      "- Prepared audit schedules and audit support packages producing 3 consecutive clean external audits.",
      "- Automated journal entries workflows in NetSuite, saving 60 hours per quarter.",
      "- Reported monthly results to the Controller with GAAP-compliant variance analysis in advanced Excel models.",
      "Staff Accountant | Example Services | May 2015 - Jan 2019",
      "- Managed general ledger reconciliations and journal entries for 3 subsidiaries.",
      "EDUCATION",
      "Bachelor of Science, Accounting | State University",
      "CERTIFICATIONS",
      "Certified Public Accountant (CPA), active license",
      "SKILLS",
      "Accounting: GAAP, month-end close, general ledger reconciliations, journal entries, audit support, NetSuite, Excel",
    ].join("\n"),
    jd: "Senior Accountant. Own month-end close, general ledger reconciliations, journal entries, and audit support. Requires CPA, strong GAAP knowledge, NetSuite experience, and advanced Excel. Reports to the Controller.",
  },
  {
    domain: "teaching",
    resume: [
      "ALEX EXAMPLE",
      "City, ST | (317) 555-0100 | alex@example.com | linkedin.com/in/example",
      "PROFESSIONAL EXPERIENCE",
      "Fourth Grade Teacher | Example Elementary School | Aug 2018 - Present",
      "- Taught literacy and mathematics instruction to 28 students aligned to state standards.",
      "- Raised reading proficiency 34% in one year through differentiated instruction in small groups.",
      "- Developed curriculum aligned to state standards and mentored 4 student teachers.",
      "- Led parent communication conferences and built individualized education plans (IEP) for 9 students.",
      "- Managed classroom management systems recognized in district instructional reviews.",
      "Student Teacher | Example Middle School | Jan 2017 - Jun 2018",
      "- Delivered curriculum development support and small-group literacy instruction.",
      "EDUCATION",
      "Bachelor of Science, Elementary Education | State University",
      "CERTIFICATIONS",
      "State teaching license, Elementary Education K-6",
      "SKILLS",
      "Instruction: differentiated instruction, curriculum development, classroom management, IEP development, parent communication",
    ].join("\n"),
    jd: "Fourth Grade Teacher. Deliver literacy and mathematics instruction aligned to state standards. Requires state teaching license, classroom management, differentiated instruction, curriculum development, IEP experience, and parent communication.",
  },
];

const score = (c: Case) => analyzeResumeAgainstJob(c.resume, c.jd);
const byDomain = (name: string) => {
  const found = CASES.find((c) => c.domain.startsWith(name));
  if (!found) throw new Error(`no fixture for ${name}`);
  return score(found);
};

// ---------------------------------------------------------------------------
// ACCEPTANCE — fixed 2026-07-16. The scorer previously carried 8 hardcoded
// operations/logistics signals; a strong nurse resume scored 48 / "Low match"
// and atsScore was a constant 100. History: coordination/CHALLENGES.md C-001.
// These assertions are the contract: the scan must work for anybody who signs
// up, in any career domain. Do not weaken the fixtures to keep them green.
// ---------------------------------------------------------------------------

describe("analyzeResumeAgainstJob domain coverage", () => {
  it("PROBE: reports scores for a strong resume in each domain", () => {
    const rows = CASES.map(({ domain, resume, jd }) => {
      const r = analyzeResumeAgainstJob(resume, jd);
      return {
        domain,
        overall: r.score,
        ats: r.atsScore,
        keyword: r.keywordScore,
        evidence: r.evidenceScore,
        signal: r.signalScore,
        fit: r.fitLabel,
        matched: `${r.matchedCount}/${r.totalKeywords}`,
      };
    });

    // eslint-disable-next-line no-console
    console.table(rows);
    expect(rows).toHaveLength(CASES.length);
  });

  it("does not tell a strong nurse she has limited alignment for nursing", () => {
    expect(byDomain("nursing").fitLabel).not.toBe("Limited alignment");
  });

  it("gives every strong resume at least moderate weighted alignment", () => {
    for (const c of CASES) {
      expect(score(c).score).toBeGreaterThanOrEqual(60);
    }
  });

  it("varies the ATS score with real structure instead of returning a constant", () => {
    const structured = byDomain("software engineering").atsScore;
    const unstructured = analyzeResumeAgainstJob(
      "I have worked in software for many years and know a lot about computers and teamwork.",
      CASES[2].jd
    ).atsScore;

    expect(structured).toBeGreaterThan(unstructured);
    expect(unstructured).toBeLessThan(50);
  });

  it("derives keywords from the JD itself, not from a hardcoded domain list", () => {
    const nursing = byDomain("nursing");
    const jdOnly = [...nursing.matchedKeywords, ...nursing.missingKeywordDetails.map((d) => d.term)];

    // Every reported term must literally appear in the nursing JD text.
    const jd = CASES[1].jd.toLowerCase();
    for (const term of jdOnly) {
      expect(jd).toContain(term.toLowerCase().split(" ")[0]);
    }
    // And no ops-domain ghost terms may surface for a nursing JD.
    for (const ghost of ["p&l ownership", "throughput", "wms", "site performance", "shrink"]) {
      expect(jdOnly.map((t) => t.toLowerCase())).not.toContain(ghost);
    }
  });
});
