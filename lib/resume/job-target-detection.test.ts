import { inferJobDetails } from "./job-target-detection";

describe("inferJobDetails", () => {
  it("extracts an Indeed-style title and legal company name through listing noise", () => {
    const jobDescription = `
Warehouse Operations Manager - job post
AspireXDock, LLC
3.0 out of 5 stars
Indianapolis, IN 46221
$80,000 - $85,000 a year - Full-time
AspireXDock, LLC
4 reviews
Job details
Full job description
We are seeking a warehouse leader to improve shipping operations.
Strong operational leadership and communication skills are required.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Warehouse Operations Manager",
      company: "AspireXDock, LLC",
    });
  });

  it("rejects competency phrases as job titles", () => {
    const jobDescription = `
Job Overview
Strong Operational Leadership
Excellent communication skills
Ability to manage competing priorities
AspireXDock, LLC
Indianapolis, IN 46221
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "",
      company: "AspireXDock, LLC",
    });
  });

  it("does not turn generic listing headings into a company", () => {
    const jobDescription = `
Job Overview
Benefits
Full job description
Strong operational leadership and communication skills are required.
The successful candidate will manage daily workflows and team performance.
`;

    expect(inferJobDetails(jobDescription)).toEqual({ role: "", company: "" });
  });

  it("reads explicit labels without mistaking a location for the company", () => {
    const jobDescription = `
Job title: Senior Operations Manager
Company: Confidential
Indianapolis, IN 46226
$110,000 - $130,000 a year
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Senior Operations Manager",
      company: "Confidential",
    });
  });

  it("keeps titles that contain a location-neutral qualifier", () => {
    const jobDescription = `
Customer Solutions Manager, Small and Medium Business (Scale CSM) - job post
Amazon Web Services, Inc.
Job ID: 10433
The manager guides customers through cloud adoption.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Customer Solutions Manager, Small And Medium Business (Scale CSM)",
      company: "Amazon Web Services, Inc.",
    });
  });

  it("detects a nursing title and hospital name without legal company suffixes", () => {
    const jobDescription = `
Registered Nurse - Medical Surgical
Northside Regional Hospital
We are seeking a registered nurse to deliver safe patient care on a busy medical-surgical unit.
Responsibilities include patient assessment, medication administration, and discharge education.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Registered Nurse - Medical Surgical",
      company: "Northside Regional Hospital",
    });
  });

  it("detects a stylized lowercase-leading employer in an Indeed listing", () => {
    const jobDescription = `
Production Planning Supervisor- job post
nGROUP PERFORMANCE PARTNERS
2.7 out of 5 stars
Franklin, IN 46131
$70,000 a year - Full-time
Job details
Full job description
Build shift labor plans aligned to volume and standards.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "nGROUP PERFORMANCE PARTNERS",
    });
  });

  it.each(["Job Overview", "About Us", "Role Purpose", "Position Summary"])(
    "does not treat the generic heading %s as the employer",
    (heading) => {
      const jobDescription = `
Production Planning Supervisor - job post
${heading}
We build shift labor plans aligned to volume and standards.
The supervisor leads hourly execution reviews and reports plan versus actual results.
`;

      expect(inferJobDetails(jobDescription)).toEqual({
        role: "Production Planning Supervisor",
        company: "",
      });
    }
  );

  it("does not treat an introductory sentence as the employer", () => {
    const jobDescription = `
Production Planning Supervisor - job post
We build products people rely on every day
The supervisor leads hourly execution reviews and protects schedule adherence.
Strong planning and floor leadership are required.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "",
    });
  });

  it("finds an employer that appears before the role title", () => {
    const jobDescription = `
Therapy Brands
Finance Data Analyst - job post
Remote - Full-time
Analyze revenue, forecasts, and operating metrics for business leaders.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Finance Data Analyst",
      company: "Therapy Brands",
    });
  });

  it("does not promote a title-like employer above an unlabelled role", () => {
    const jobDescription = `
Northstar Operations Partners
Production Planning Supervisor
Franklin, IN 46131
Build shift labor plans aligned to volume, capacity, and customer demand.
Lead hourly execution reviews and report plan versus actual results.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "Northstar Operations Partners",
    });
  });

  it("keeps a title-like employer when the unlabelled role appears first", () => {
    const jobDescription = `
Production Planning Supervisor
Northstar Operations Partners
Franklin, IN 46131
Build shift labor plans aligned to volume, capacity, and customer demand.
Lead hourly execution reviews and report plan versus actual results.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "Northstar Operations Partners",
    });
  });

  it("distinguishes a solutions company from a data role", () => {
    const jobDescription = `
Northstar Data Solutions
Senior Data Analyst
Remote
Build reliable reporting models and explain findings to business leaders.
Use SQL and Python to validate data quality across source systems.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Senior Data Analyst",
      company: "Northstar Data Solutions",
    });
  });

  it("does not fabricate a role from an employer-only listing fragment", () => {
    const jobDescription = `
Northstar Operations Partners
Franklin, IN 46131
$70,000 a year - Full-time
Job details
Benefits and application instructions are available below.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "",
      company: "Northstar Operations Partners",
    });
  });

  it("does not use an organization mentioned later in requirements as the employer", () => {
    const jobDescription = `
Production Planning Supervisor
Franklin, IN 46131
Build shift labor plans aligned to volume, capacity, and customer demand.
Lead hourly execution reviews and report plan versus actual results.
Education
Northstar University
Bachelor's degree or comparable experience is preferred.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "",
    });
  });

  it("finds the target after job-board metadata", () => {
    const jobDescription = `
3.4 out of 5 stars
Indianapolis, IN 46202
Registered Nurse - Medical Surgical
Northside Regional Hospital
Deliver safe patient care, medication administration, and discharge education.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Registered Nurse - Medical Surgical",
      company: "Northside Regional Hospital",
    });
  });

  it("reads a public-sector employer and IT title after a job-board logo row", () => {
    const jobDescription = `
Company logo for, Example County.
Example County

IT Analyst

Example County, VA - 1 week ago - 25 people clicked apply
Responses managed off LinkedIn
About the job
Support Oracle HCM applications and write Oracle SQL reports.
`;

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "IT Analyst",
      company: "Example County",
    });
  });

  it("does not let a first-line logo sentence mask a later role title", () => {
    const jobDescription = [
      "Company logo for, Example County.",
      "Example County",
      "IT Analyst",
      "Example County, VA - 1 week ago - 25 people clicked apply",
      "Responses managed off LinkedIn",
      "Hybrid",
      "Full-time",
      "Apply",
      "Saved",
      "BETA - Is this information helpful?",
      "About the job",
      "Support Oracle HCM applications and write Oracle SQL reports.",
    ].join("\n");

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "IT Analyst",
      company: "Example County",
    });
  });

  it("detects a title-at-company headline when pasted prose has no line breaks", () => {
    const jobDescription = "Production Planning Supervisor at Northstar Manufacturing. Lead shift-level production planning and execution. Build labor plans aligned to demand forecasts and capacity. Track schedule adherence, inventory turns, throughput, and service levels.";

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Production Planning Supervisor",
      company: "Northstar Manufacturing",
    });
  });

  it("does not mistake the first responsibility for the employer", () => {
    const jobDescription = [
      "Operations Manager",
      "Compile operational reports.",
      "Develop efficient workflows and labor plans.",
    ].join("\n");

    expect(inferJobDetails(jobDescription)).toEqual({
      role: "Operations Manager",
      company: "",
    });
  });
});
