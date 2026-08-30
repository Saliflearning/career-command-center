import GoogleProvider from "next-auth/providers/google";
import type { GoogleProfile } from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions, TokenSet } from "next-auth";
import { db } from "@/lib/db/client";
import { shouldEnableDevelopmentAuth } from "@/lib/auth/development-auth";
import { shouldAllowVerifiedEmailAccountLinking } from "@/lib/auth/oauth-account-linking";
import {
  reconcileVerifiedGoogleAccount,
  type VerifiedGoogleLinkStore,
} from "@/lib/auth/verified-google-linking";
import { isEmailVerificationRequired } from "@/lib/auth/verification";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Custom LinkedIn OAuth 2.0 provider
// LinkedIn deprecated v1 OAuth; the official next-auth LinkedInProvider targets
// the older OIDC endpoint that requires additional scopes not available to all
// developer apps. This custom provider targets the standard OAuth 2.0 token
// exchange and the LinkedIn OpenID Connect userinfo endpoint.
// ---------------------------------------------------------------------------
interface LinkedInProfile {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

function LinkedInProvider(
  options: OAuthUserConfig<LinkedInProfile>
): OAuthConfig<LinkedInProfile> {
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth",
    authorization: {
      url: "https://www.linkedin.com/oauth/v2/authorization",
      params: {
        scope: "openid profile email",
        response_type: "code",
      },
    },
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfo: "https://api.linkedin.com/v2/userinfo",
    profile(profile: LinkedInProfile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture ?? null,
      };
    },
    style: {
      logo: "/linkedin.svg",
      bg: "#0077B5",
      text: "#fff",
    },
    allowDangerousEmailAccountLinking:
      shouldAllowVerifiedEmailAccountLinking("linkedin"),
    options,
  };
}

function VerifiedGoogleProvider(options: {
  clientId: string;
  clientSecret: string;
}): OAuthConfig<GoogleProfile> {
  const provider = GoogleProvider({
    ...options,
    allowDangerousEmailAccountLinking:
      shouldAllowVerifiedEmailAccountLinking("google"),
    authorization: {
      params: {
        prompt: "select_account",
        access_type: "offline",
      },
    },
  });

  return {
    ...provider,
    // NextAuth resolves OAuth accounts after this mapper runs. Reconcile a
    // verified Google subject here so a changed OAuth client identity can be
    // attached before the adapter's getUserByAccount lookup.
    async profile(profile: GoogleProfile, tokens: TokenSet) {
      const outcome = await db.$transaction(async (transaction) => {
        const reconciled = await reconcileVerifiedGoogleAccount(
          {
            account: {
              ...tokens,
              provider: "google",
              type: "oauth",
              providerAccountId: profile.sub,
            },
            profile,
          },
          transaction as unknown as VerifiedGoogleLinkStore
        );

        const linkedAccount = reconciled
          ? await transaction.account.findUnique({
              where: {
                provider_providerAccountId: {
                  provider: "google",
                  providerAccountId: profile.sub,
                },
              },
              select: { userId: true },
            })
          : null;

        return { reconciled, linked: Boolean(linkedAccount) };
      });

      if (!outcome.reconciled || !outcome.linked) {
        throw new Error("Google account ownership could not be verified.");
      }

      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
      };
    },
    allowDangerousEmailAccountLinking:
      shouldAllowVerifiedEmailAccountLinking("google"),
  };
}

// ---------------------------------------------------------------------------
// NextAuth configuration
// ---------------------------------------------------------------------------
const devAuthEnabled = shouldEnableDevelopmentAuth(
  process.env.NODE_ENV,
  process.env.ENABLE_DEV_AUTH
);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),

  providers: [
    ...(devAuthEnabled
      ? [
          CredentialsProvider({
            id: "dev-login",
            name: "Local test user",
            credentials: {
              email: {
                label: "Email",
                type: "email",
                placeholder: "dev@local.test",
              },
            },
            async authorize(credentials) {
              const email =
                credentials?.email?.trim().toLowerCase() || "dev@local.test";

              if (!email.endsWith("@local.test")) {
                throw new Error("Development login only accepts @local.test emails.");
              }

              return db.user.upsert({
                where: { email },
                update: {
                  name: "Local Demo User",
                  emailVerified: new Date(),
                },
                create: {
                  email,
                  name: "Local Demo User",
                  emailVerified: new Date(),
                },
                select: {
                  id: true,
                  email: true,
                  name: true,
                  image: true,
                },
              });
            },
          }),
        ]
      : []),

    // Email + password — works for any user who signed up with a password
    CredentialsProvider({
      id: "email-password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            hashedPassword: true,
            emailVerified: true,
            createdAt: true,
          },
        });
        if (!user?.hashedPassword) return null;
        const valid = await bcrypt.compare(credentials.password, user.hashedPassword);
        if (!valid) return null;

        // Gate only accounts created at or after the configured rollout cutoff.
        // This keeps legacy password users accessible while new accounts prove
        // ownership through the transactional email flow.
        if (isEmailVerificationRequired(user.createdAt) && !user.emailVerified) {
          throw new Error("Please verify your email address before signing in.");
        }

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),

    // Admin password credential — works whenever ADMIN_PASSWORD is set.
    // Lets the site owner log into the admin panel without needing OAuth.
    ...(process.env.ADMIN_PASSWORD
      ? [
          CredentialsProvider({
            id: "admin-password",
            name: "Admin password",
            credentials: {
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              if (!credentials?.password) return null;
              if (credentials.password !== process.env.ADMIN_PASSWORD) return null;
              // Return a synthetic admin user — not stored in DB
              const adminEmail =
                process.env.ADMIN_EMAIL ?? "admin@example.com";
              return {
                id: "admin",
                email: adminEmail,
                name: "Admin",
                image: null,
              };
            },
          }),
        ]
      : []),

    // Google OAuth — only add when credentials are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          VerifiedGoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    // LinkedIn OAuth — only add when credentials are configured
    ...(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
      ? [
          LinkedInProvider({
            clientId: process.env.LINKEDIN_CLIENT_ID,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          }),
        ]
      : []),

    // Email magic link — only add when email server is configured
    ...(process.env.EMAIL_SERVER
      ? [
          EmailProvider({
            server: process.env.EMAIL_SERVER,
            from: process.env.EMAIL_FROM ?? "noreply@example.com",
            maxAge: 10 * 60,
          }),
        ]
      : []),
  ],

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/signin",
    newUser: "/signup",
    // Keep the error page default (/auth/error) so NextAuth handles it
  },

  // A real NEXTAUTH_SECRET always wins. The deterministic fallback is limited
  // to non-production runtimes that have opted into local development auth.
  // A stale production dev-auth flag cannot publish a test-user provider or
  // activate this known fallback.
  secret:
    process.env.NEXTAUTH_SECRET ??
    (devAuthEnabled
      ? "career-command-center-local-dev-secret"
      : undefined),

  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider !== "google") return true;

      return db.$transaction((transaction) =>
        reconcileVerifiedGoogleAccount(
          { account, profile: profile ?? {} },
          transaction as unknown as VerifiedGoogleLinkStore
        )
      );
    },

    /**
     * Persist the user's database id onto the JWT so that
     * `session.user.id` is always available on the client.
     */
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },

    /**
     * Expose `session.user.id` from the JWT sub claim.
     * Never expose raw DB relations or secret fields here.
     */
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },

  // Enable debug logging in development only
  debug: process.env.NODE_ENV === "development",
};

// Augment NextAuth session type to include user.id
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
