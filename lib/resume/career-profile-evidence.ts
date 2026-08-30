export type ReusableCareerBullet = {
  content: string;
  contentType: string;
  keywords: string[];
};

export function reusableCareerProfileBullets<T extends ReusableCareerBullet>(
  bullets: T[]
): T[] {
  return bullets.filter((bullet) => bullet.contentType !== "GENERATED");
}