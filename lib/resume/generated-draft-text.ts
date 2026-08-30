type ComparableDraft = {
  candidateName: string | null;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLinkedin: string | null;
  candidateWebsite: string | null;
  candidateLocation: string | null;
  targetRole: string;
  targetCompany: string | null;
  summaryText: string | null;
  workHistory: Array<{
    company: string;
    title: string;
    location: string | null;
    startDate: string;
    endDate: string | null;
    current: boolean;
    bullets: Array<{ content: string }>;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    graduationDate: string | null;
    inProgress: boolean;
  }>;
  certifications: Array<{
    name: string;
    issuingBody: string | null;
    issueDate: string | null;
  }>;
  skills: Array<{ name: string; category: string | null }>;
};

export function draftToComparableText(draft: ComparableDraft) {
  const sections: string[] = [];
  const contact = compact([
    draft.candidateName,
    draft.candidateEmail,
    draft.candidatePhone,
    draft.candidateLinkedin,
    draft.candidateWebsite,
    draft.candidateLocation,
  ]);
  if (contact.length > 0) sections.push(section("CONTACT", contact));

  const target = compact([draft.targetRole, draft.targetCompany]);
  if (target.length > 0) sections.push(section("TARGET", target));

  if (draft.summaryText?.trim()) {
    sections.push(section("SUMMARY", [draft.summaryText]));
  }

  const experience = draft.workHistory.flatMap((job) => {
    const dateRange = job.startDate
      ? `${job.startDate.slice(0, 4)} - ${job.current ? "Present" : job.endDate?.slice(0, 4) ?? "Present"}`
      : null;
    const heading = compact([
      [job.title, job.company, dateRange].filter(Boolean).join(" | "),
      job.location,
    ]);
    const bullets = job.bullets
      .map((bullet) => bullet.content.trim())
      .filter(Boolean)
      .map((bullet) => `- ${bullet}`);
    return [...heading, ...bullets];
  });
  if (experience.length > 0) sections.push(section("EXPERIENCE", experience));

  const education = draft.education.map((entry) =>
    [entry.degree, entry.institution].filter(Boolean).join(" | ")
  );
  if (education.length > 0) sections.push(section("EDUCATION", education));

  const certifications = draft.certifications.map((entry) =>
    [entry.name, entry.issuingBody].filter(Boolean).join(" | ")
  );
  if (certifications.length > 0) sections.push(section("CERTIFICATIONS", certifications));

  const groupedSkills = new Map<string, string[]>();
  for (const skill of draft.skills) {
    const name = skill.name.trim();
    if (!name) continue;
    const category = skill.category?.trim() || "Core";
    const group = groupedSkills.get(category) ?? [];
    if (!group.some((entry) => entry.toLowerCase() === name.toLowerCase())) group.push(name);
    groupedSkills.set(category, group);
  }
  const skills = Array.from(groupedSkills, ([category, names]) => `${category}: ${names.join(", ")}`);
  if (skills.length > 0) sections.push(section("SKILLS", skills));

  return sections.join("\n\n");
}

function section(label: string, lines: Array<string | null | undefined>) {
  return [label, ...compact(lines)].join("\n");
}

function compact(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}
