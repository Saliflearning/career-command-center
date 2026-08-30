import { extractJobTermDetails } from "./scan-analysis";

// C-038: single-occurrence JD prose fragments (verb/adverb/preposition runs the
// posting uses once, in flowing sentences) were being scored as required
// "keywords" — e.g. "beyond daily management", "achieving exceptional customer".
// They crowded out the real skills and tanked strong resumes' match scores.
// A phrase the JD uses ONCE is demoted to low-priority fill (the same reasoning
// the single-WORD path already applies), so it can never displace a repeated,
// named, or role-title requirement in a content-rich JD.
//
// All fixtures synthetic — no real posting or PII.
describe("JD term extraction: one-off prose is not a requirement (C-038)", () => {
  // A realistic, content-rich posting (real JDs are — all 7 golden triples are).
  const richJd = [
    "Senior Warehouse Operations Manager",
    "",
    "Lead a team of supervisors and drive process improvement across warehouse operations.",
    "Own labor planning, workflow standardization, and continuous process improvement to raise productivity.",
    "Track key performance indicators and accuracy metrics; compile productivity and safety reports.",
    "Uphold health and safety compliance and reinforce safety awareness across every warehouse shift.",
    "Manage inventory operations and inventory accuracy for inbound and outbound operations.",
    "Develop supervisors through coaching, and provide coaching and leadership to the operations team.",
    "Own P&L management and budget objectives while reducing costs and improving operational efficiency.",
    "Standardize logistics processes, operational reporting, and operational reviews across the site.",
    "Partner with cross-functional teams and customers to ensure prompt order fulfillment.",
    "You will be achieving exceptional customer satisfaction while fostering collaboration beyond daily management.",
  ].join("\n");

  const terms = extractJobTermDetails(richJd).map((t) => t.term);

  it("keeps a phrase the JD repeats (real requirement)", () => {
    expect(terms).toContain("process improvement");
  });

  it("drops one-off prose fragments that are not skills", () => {
    for (const prose of [
      "achieving exceptional",
      "exceptional customer",
      "beyond daily",
      "daily management",
      "fostering collaboration",
    ]) {
      expect(terms).not.toContain(prose);
    }
  });

  it("surfaces real requirements instead of prose", () => {
    // With prose demoted, the content-rich JD fills its budget with real terms,
    // whether they are represented alone or in a more specific phrase.
    const hasRealSignal = ["productivity", "safety", "inventory", "supervisors"].some(
      (word) => terms.some((term) => term.split(" ").includes(word))
    );
    expect(hasRealSignal).toBe(true);
  });
});
