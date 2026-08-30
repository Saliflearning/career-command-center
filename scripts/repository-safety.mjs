import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const mode = process.argv[2] ?? "--current";

const ignoredDirectories = new Set([
  ".git",
  ".agents",
  ".claude",
  ".specify",
  ".next",
  ".vercel",
  "coverage",
  "graphify-out",
  "node_modules",
  "out",
]);

const ignoredRootFiles = new Set(["AGENTS.md", "CLAUDE.md"]);
const allowedEmailDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "example.test",
  "local.test",
  "izs.me", // Package-lock deprecation metadata from an upstream dependency.
]);

// SHA-256 fingerprints let the release gate detect protected owner identifiers
// without publishing those identifiers in the scanner itself.
const protectedFingerprints = new Set([
  "3819c1f2b05e89b513093a1dfc5f78573dd7ea3bffccefac8f566f453d4b4cfd",
  "b57fae016c2e46e7916039a9add561837d71dfc3793f38fd894ff53cec5e34dc",
  "7a8f3eee569c20fb934382031de2d9236ded74f9b30512d0e0006720cac0689d",
  "abf06438890ef0d83053cc03d1a707cc334ec1f0f822bc00696f93f55a645c42",
]);

const forbiddenPathPatterns = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)(agent_coordination|backlog|baton|challenges|protocol)\.md$/i,
  /(^|\/)(dev|build)\.(out|err)\.log$/i,
  /(^|\/)coordination\//i,
  /\.triple\.local\.json$/i,
];

const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["Anthropic key", /sk-ant-[A-Za-z0-9_-]{12,}/g],
  ["OpenAI key", /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
];

const emailPattern = /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const phonePattern = /(?:\+?1[-. ]?)?(?:\(\d{3}\)|\d{3})[-. ]\d{3}[-. ]\d{4}/g;
const fictionalPhonePattern = /^(?:\+?1[-. ]?)?(?:\(\d{3}\)|\d{3})[-. ]555[-. ]01\d{2}$/;
const tokenPattern = /[A-Za-z][A-Za-z0-9._%+-]*(?:@[A-Za-z0-9.-]+\.[A-Za-z]{2,})?|[A-Za-z]{3,}/g;

function hash(value) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

function scanText(path, text) {
  const findings = [];

  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) findings.push(`${path}: ${label}`);
  }

  emailPattern.lastIndex = 0;
  for (const match of text.matchAll(emailPattern)) {
    const domain = match[1].toLowerCase();
    if (!allowedEmailDomains.has(domain)) {
      findings.push(`${path}: non-reserved email domain (${domain})`);
    }
  }

  phonePattern.lastIndex = 0;
  for (const match of text.matchAll(phonePattern)) {
    if (!fictionalPhonePattern.test(match[0])) {
      findings.push(`${path}: phone-like value is outside the fictional 555-01xx range`);
    }
  }

  tokenPattern.lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    if (protectedFingerprints.has(hash(match[0]))) {
      findings.push(`${path}: protected owner identifier fingerprint`);
    }
  }

  return findings;
}

function scanEntry(path, content) {
  const normalizedPath = path.replaceAll("\\", "/");
  const findings = [];
  const isPublicEnvTemplate = normalizedPath === ".env.example";
  if (!isPublicEnvTemplate && forbiddenPathPatterns.some((pattern) => pattern.test(normalizedPath))) {
    findings.push(`${normalizedPath}: forbidden private/internal path`);
  }
  if (!content.includes("\0")) {
    findings.push(...scanText(normalizedPath, content));
  }
  return findings;
}

function currentFiles(directory = root) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    if (directory === root && ignoredRootFiles.has(entry)) continue;
    const absolute = resolve(directory, entry);
    if (statSync(absolute).isDirectory()) files.push(...currentFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function scanCurrent() {
  return currentFiles().flatMap((absolute) => {
    const path = relative(root, absolute).replaceAll("\\", "/");
    return scanEntry(path, readFileSync(absolute).toString("utf8"));
  });
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

function scanHistory() {
  const commits = git("rev-list", "--all").split(/\r?\n/).filter(Boolean);
  const findings = [];
  for (const commit of commits) {
    const paths = git("ls-tree", "-r", "--name-only", commit).split(/\r?\n/).filter(Boolean);
    for (const path of paths) {
      const content = execFileSync("git", ["show", `${commit}:${path}`], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      findings.push(...scanEntry(`${commit.slice(0, 12)}:${path}`, content));
    }
  }
  return findings;
}

function selfTest() {
  const failures = [];
  if (scanText("safe.txt", "Alex Morgan | alex@example.com | (202) 555-0142").length !== 0) {
    failures.push("safe synthetic record was rejected");
  }
  const nonReservedEmail = `person${"@"}example.edu`;
  if (!scanText("unsafe.txt", `Contact ${nonReservedEmail}`).some((item) => item.includes("email domain"))) {
    failures.push("non-reserved email domain was not detected");
  }
  const nonFictionalPhone = ["202", "867", "5309"].join("-");
  if (!scanText("unsafe.txt", `Call ${nonFictionalPhone}`).some((item) => item.includes("phone-like"))) {
    failures.push("non-fictional phone-like value was not detected");
  }
  const fakeAccessKey = `AKIA${"ABCDEFGHIJKLMNOP"}`;
  if (!scanText("unsafe.txt", fakeAccessKey).some((item) => item.includes("AWS access key"))) {
    failures.push("secret pattern was not detected");
  }
  return failures;
}

let findings;
if (mode === "--current") findings = scanCurrent();
else if (mode === "--history") findings = scanHistory();
else if (mode === "--self-test") findings = selfTest();
else throw new Error(`Unknown mode: ${mode}`);

if (findings.length > 0) {
  console.error(`Repository safety gate failed with ${findings.length} finding(s):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Repository safety gate passed (${mode}).`);
