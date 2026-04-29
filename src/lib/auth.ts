import { cookies } from 'next/headers';
import { getDbPool } from '@/lib/db';

export const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AuthUser = {
  accId: number;
  personId: number | null;
  email: string;
  isAdmin: boolean;
  fullName: string | null;
};

function encodeToken(payload: AuthUser) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeToken(token: string): AuthUser | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.email !== 'string') return null;
    return {
      accId: Number(parsed.accId),
      personId: parsed.personId == null ? null : Number(parsed.personId),
      email: String(parsed.email),
      isAdmin: Boolean(parsed.isAdmin),
      fullName: parsed.fullName == null ? null : String(parsed.fullName),
    };
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const pool = getDbPool();
  const query = `
    SELECT
      a.id,
      a.person_id,
      a.email,
      a.is_admin,
      p.full_name
    FROM master_acc a
    LEFT JOIN master_people p ON p.id = a.person_id
    WHERE lower(a.email) = lower($1)
      AND a.is_active = true
      AND a.password_plain = $2
    LIMIT 1
  `;
  const result = await pool.query(query, [email, password]);
  const row = result.rows[0];
  if (!row) return null;

  return {
    accId: Number(row.id),
    personId: row.person_id == null ? null : Number(row.person_id),
    email: String(row.email),
    isAdmin: Boolean(row.is_admin),
    fullName: row.full_name == null ? null : String(row.full_name),
  };
}

export async function createAuthCookie(user: AuthUser) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, encodeToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });
}

export async function getAuthUserFromCookie(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeToken(token);
}
