import { NextResponse } from "next/server"
import { auth } from "@/auth"

export async function GET(request: Request) {
  const session = await auth()
  const base = new URL(request.url).origin

  if (!session?.user) {
    return NextResponse.redirect(new URL("/", base))
  }

  const role = session.user.role
  const response = NextResponse.redirect(new URL("/dashboard", base))

  if (role) {
    response.cookies.set("user_role", role, { httpOnly: false, sameSite: "lax", path: "/" })
  }

  return response
}
