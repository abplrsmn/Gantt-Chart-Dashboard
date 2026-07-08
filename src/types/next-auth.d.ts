import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      accId: number
      isAdmin: boolean
      role: string
      fullName: string | null
      email: string
      name?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accId?: number
    isAdmin?: boolean
    role?: string
    fullName?: string | null
  }
}
