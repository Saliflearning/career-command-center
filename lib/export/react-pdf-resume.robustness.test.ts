/**
 * Robustness battery for the react-pdf renderer. Real users produce messy,
 * varied data; this throws a range of realistic and adversarial inputs at the
 * renderer and asserts the only two safe outcomes:
 *   (a) a clean single-page PDF, or
 *   (b) a thrown StructuredResumeOverflowError / StructuredResumeContentError
 *       that the callers already turn into a 422.
 * A multi-page or clipped "success" is a bug. A few cases are also dumped to the
 * OS temp dir for visual inspection.
 */
import os from "os";
import path from "path";
import fs from "fs";
import { renderStructuredResumePdfReactPdf } from "./react-pdf-resume";
import {
  StructuredResumeOverflowError,
  StructuredResumeContentError,
  type StructuredResumeExportInput,
} from "./structured-resume-pdf";

function base(overrides: Partial<StructuredResumeExportInput> = {}): StructuredResumeExportInput {
  return {
    targetRole: "Operations Manager",
    targetCompany: null,
    roleType: "OPERATIONS",
    headline: null,
    candidate: {
      name: "Jordan Candidate",
      email: "jordan@example.com",
      phone: "555-0100",
      linkedin: "linkedin.com/in/jordan-candidate",
      location: "Indianapolis, IN",
      website: null,
    },
    summary: "Operations professional with a track record of measurable results.",
    jobs: [
      { id: "1", title: "Operations Manager", company: "Midwest Co", location: "Indianapolis, IN",
        startDate: "2020-01-01", endDate: "2024-01-01", current: false, sortOrder: 0,
        bullets: ["Led a team and improved throughput by 20%."] },
    ],
    skills: [{ name: "Leadership", category: "Core Skills" }, { name: "KPIs", category: "Core Skills" }, { name: "Scheduling", category: "Core Skills" }],
    education: [{ degree: "B.S. Business", institution: "State University", graduationDate: "2019-05-01", inProgress: false }],
    certifications: [{ name: "PMP", issuingBody: null, issueDate: null }],
    ...overrides,
  };
}

function longJob(i: number, bullets: number): StructuredResumeExportInput["jobs"][number] {
  return {
    id: String(i), title: `Senior Operations Manager ${i}`, company: `Global Logistics Company ${i}`,
    location: "Indianapolis, IN", startDate: "2015-01-01", endDate: "2020-01-01", current: false, sortOrder: i,
    bullets: Array.from({ length: bullets }, (_, b) =>
      `Directed cross-functional initiative ${b + 1} spanning multiple departments, coordinating stakeholders and reducing operational cost while maintaining safety and quality across a high-volume distribution network.`),
  };
}

type Case = { name: string; input: StructuredResumeExportInput; expect: "page" | "overflow" | "content"; dump?: boolean };

const CASES: Case[] = [
  { name: "minimal", input: base({ summary: null, skills: [], education: [], certifications: [],
      jobs: [{ id: "1", title: "Clerk", company: "Shop", location: null, startDate: "2022-01-01", endDate: null, current: true, sortOrder: 0, bullets: ["Helped customers."] }] }),
    expect: "page", dump: true },
  { name: "missing-optionals", input: base({ summary: null, skills: [], education: [], certifications: [], headline: null }), expect: "page" },
  { name: "current-job", input: base({ jobs: [{ id: "1", title: "Operations Manager", company: "Now Inc", location: "Indianapolis, IN", startDate: "2021-06-01", endDate: null, current: true, sortOrder: 0, bullets: ["Currently leading operations."] }] }), expect: "page" },
  { name: "long-resume-4jobs", input: base({ jobs: [longJob(0, 4), longJob(1, 4), longJob(2, 3), longJob(3, 3)],
      skills: Array.from({ length: 16 }, (_, i) => ({ name: `Skill ${i + 1} Name`, category: i < 8 ? "Leadership" : "Operations" })) }),
    expect: "page", dump: true },
  { name: "overflow-huge", input: base({ jobs: Array.from({ length: 10 }, (_, i) => longJob(i, 6)) }), expect: "overflow" },
  { name: "long-unbreakable-tokens", input: base({ candidate: { ...base().candidate,
      email: "jordan.a.very.long.email.address.for.line.wrapping.candidate@example.com",
      linkedin: "linkedin.com/in/jordan-a-candidate-operations-manager-logistics-supply-chain-2024",
      website: "https://example.com/portfolio/jordan-candidate/operations-excellence-case-studies" },
      skills: [{ name: "Supercalifragilisticexpialidocious-Operations-Methodology", category: "Core Skills" }, { name: "KPIs", category: "Core Skills" }, { name: "Scheduling", category: "Core Skills" }] }),
    expect: "page", dump: true },
  { name: "unicode-latin1", input: base({ candidate: { ...base().candidate, name: "José Ñúñez-Müller" },
      summary: "Opérations manager with naïve café-level résumé façade — em dash included.",
      jobs: [{ id: "1", title: "Gestión de Operaciones", company: "Compañía Española", location: "Madrid, España", startDate: "2020-01-01", endDate: "2024-01-01", current: false, sortOrder: 0, bullets: ["Dirigió un equipo de 50 asociados con mejoras del 20%."] }] }),
    expect: "page", dump: true },
  { name: "unicode-extended", input: base({ candidate: { ...base().candidate, name: "Łukasz Żółć" },
      summary: "Operations lead based in Kraków, Łódź region.",
      jobs: [{ id: "1", title: "Kierownik Operacyjny", company: "Firma Spółka", location: "Wrocław", startDate: "2020-01-01", endDate: "2024-01-01", current: false, sortOrder: 0, bullets: ["Zarządzał zespołem."] }] }),
    expect: "page", dump: true },
  { name: "projects-data-role", input: base({ roleType: "DATA",
      projects: [{ id: "p1", name: "Churn Model", description: "Built a churn prediction model in Python with 0.82 AUC.", technologies: ["Python", "scikit-learn", "SQL"], url: "github.com/jc/churn", startDate: "2023-01-01", endDate: "2023-06-01" }],
      skills: [{ name: "Python", category: "Technical Skills" }, { name: "SQL", category: "Technical Skills" }, { name: "Tableau", category: "Technical Skills" }] }),
    expect: "page", dump: true },
  { name: "cjk-name-rejected", input: base({ candidate: { ...base().candidate, name: "田中 太郎" } }), expect: "content" },
  { name: "one-huge-section", input: base({ jobs: [{ id: "1", title: "Operations Manager", company: "Big Co", location: "Indianapolis, IN", startDate: "2015-01-01", endDate: "2024-01-01", current: false, sortOrder: 0,
      bullets: Array.from({ length: 28 }, (_, b) => `Directed cross-functional initiative ${b + 1} spanning multiple departments, coordinating stakeholders and reducing operational cost while maintaining safety and quality across a high-volume distribution network.`) }] }),
    expect: "overflow" },
];

describe("react-pdf renderer robustness battery", () => {
  const outDir = path.join(os.tmpdir(), "rpr-battery");
  beforeAll(() => { try { fs.mkdirSync(outDir, { recursive: true }); } catch { /* ignore */ } });

  it.each(CASES)("$name -> $expect (never multi-page/clipped success)", async ({ name, input, expect: want, dump }) => {
    if (want === "overflow") {
      await expect(renderStructuredResumePdfReactPdf(input)).rejects.toBeInstanceOf(StructuredResumeOverflowError);
      return;
    }
    if (want === "content") {
      await expect(renderStructuredResumePdfReactPdf(input)).rejects.toBeInstanceOf(StructuredResumeContentError);
      return;
    }
    const result = await renderStructuredResumePdfReactPdf(input);
    expect(result.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.pageCount).toBe(1);
    if (dump) {
      fs.writeFileSync(path.join(outDir, `${name}.pdf`), result.pdf);
      // eslint-disable-next-line no-console
      console.log(`[battery] ${name}: density=${result.density}, ${result.pdf.length} bytes`);
    }
  }, 30000);
});
