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
      console.log("[auth] signIn called, email:", user.email)
      if (!user.email) return false
      try {
        const pool = getDbPool()
        const { rows } = await pool.query(
          `SELECT id FROM master_acc WHERE lower(email) = lower($1) AND is_active = true LIMIT 1`,
          [user.email]
        )
        console.log("[auth] DB result rows:", rows.length)
        return rows.length > 0
      } catch (err) {
        console.error("[auth] signIn DB error:", err)
        return false
      }
    },

    async jwt({ token, user }) {
      // On first sign-in, enrich token with DB role info
      if (user?.email) {
        const pool = getDbPool()
        const { rows } = await pool.query(
          `SELECT a.id, a.is_admin, p.full_name
           FROM master_acc a
           LEFT JOIN master_people p ON p.id = a.person_id
           WHERE lower(a.email) = lower($1) AND a.is_active = true
           LIMIT 1`,
          [user.email]
        )
        const row = rows[0]
        if (row) {
          token.accId   = Number(row.id)
          token.isAdmin = Boolean(row.is_admin)
          token.role    = row.is_admin ? "admin" : "pm"
          token.fullName = row.full_name ?? null
        }
      }
      return token
    },

    async session({ session, token }) {
      session.user.accId    = token.accId    as number
      session.user.isAdmin  = token.isAdmin  as boolean
      session.user.role     = token.role     as string
      session.user.fullName = token.fullName as string | null
      return session
    },
  },

  pages: {
    signIn: "/",
    error: "/",
  },
})
