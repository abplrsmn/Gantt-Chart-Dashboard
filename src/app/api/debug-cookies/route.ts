import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const cookies = request.cookies.getAll().map(c => c.name)
  return NextResponse.json({ cookies })
}
