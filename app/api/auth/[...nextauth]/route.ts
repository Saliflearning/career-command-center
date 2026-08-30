import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

/**
 * NextAuth catch-all route handler for Next.js 14 App Router.
 * Handles GET and POST requests for all /api/auth/* paths:
 *   /api/auth/signin, /api/auth/signout, /api/auth/callback/*, etc.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
