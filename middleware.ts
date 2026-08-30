import { withAuth } from "next-auth/middleware";

const authSecret =
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "development"
    ? "career-command-center-local-dev-secret"
    : undefined);

export default withAuth({
  secret: authSecret,
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    authorized: ({ token }) => Boolean(token),
  },
});

export const config = {
  matcher: [
    "/analytics/:path*",
    "/dashboard/:path*",
    "/export/:path*",
    "/generating/:path*",
    "/memory/:path*",
    "/onboarding/:path*",
    "/quick-resume/:path*",
    "/settings/:path*",
    "/target/:path*",
    "/tracker/:path*",
    "/upload/:path*",
    "/workspace/:path*",
  ],
};
