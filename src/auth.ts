import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { getDbPool } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      try {
        const pool = getDbPool()
        const { rows } = await pool.query(
          `SELECT id FROM master_acc WHERE lower(email) = lower($1) AND is_active = true LIMIT 1`,
          [user.email]
        )
        return rows.length > 0
      } catch {
        return false
      }
    },

    async jwt({ token, user }) {
      // On first sign-in, enrich token with DB identity info
      if (user?.email) {
        const pool = getDbPool()
        const { rows } = await pool.query(
          `SELECT a.id, p.full_name
           FROM master_acc a
           LEFT JOIN master_people p ON p.id = a.person_id
           WHERE lower(a.email) = lower($1) AND a.is_active = true
           LIMIT 1`,
          [user.email]
        )
        const row = rows[0]
        if (row) {
          token.accId   = Number(row.id)
          token.fullName = row.full_name ?? null
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user.accId    = token.accId    as number
      session.user.fullName = token.fullName as string | null
      return session
    },
  },

  pages: {
    signIn: "/",
    error: "/",
  },
})
