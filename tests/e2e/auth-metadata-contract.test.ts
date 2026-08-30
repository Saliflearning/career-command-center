import fs from "fs";
import path from "path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("auth route metadata contract", () => {
  it.each([
    ["signin", "Sign In | Career Command Center"],
    ["signup", "Create Account | Career Command Center"],
    ["forgot-password", "Reset Password | Career Command Center"],
    ["reset-password", "Choose New Password | Career Command Center"],
    ["verify-email", "Verify Email | Career Command Center"],
  ])("gives /%s an accurate document title", (route, title) => {
    const source = read(`app/(auth)/${route}/layout.tsx`);

    expect(source).toContain(`title: "${title}"`);
  });

  it("keeps the shared auth layout neutral", () => {
    const source = read("app/(auth)/layout.tsx");

    expect(source).toContain('title: "Account | Career Command Center"');
    expect(source).not.toContain("— Sign In");
  });
});
