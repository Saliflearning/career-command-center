import { reusableCareerProfileBullets } from "./career-profile-evidence";

describe("Career Profile reusable evidence", () => {
  it("keeps source and user-authored evidence but excludes generated variants", () => {
    const bullets = [
      { content: "Source fact", contentType: "VERIFIED", keywords: ["source"] },
      { content: "Accepted edit", contentType: "USER_EDITED", keywords: ["edit"] },
      { content: "Draft variant", contentType: "GENERATED", keywords: ["draft"] },
    ];

    expect(reusableCareerProfileBullets(bullets)).toEqual(bullets.slice(0, 2));
  });
});