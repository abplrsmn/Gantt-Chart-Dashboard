import { cookies } from 'next/headers';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDbPool } from '@/lib/db';

export const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AuthUser = {
  accId: number;
  personId: number | null;
  email: string;
  fullName: string | null;
};

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET env var is not set');
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function encodeToken(payload: AuthUser): string {
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${b64}.${sign(b64)}`;
}

function decodeToken(token: string): AuthUser | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const b64 = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(b64);
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const parsed = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.email !== 'string') return null;
    return {
      accId: Number(parsed.accId),
      personId: parsed.personId == null ? null : Number(parsed.personId),
      email: String(parsed.email),
      fullName: parsed.fullName == null ? null : String(parsed.fullName),
    };
  } catch {
    return null;
  }
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT a.id, a.person_id, a.email, a.password_hash, p.full_name
     FROM master_acc a
     LEFT JOIN master_people p ON p.id = a.person_id
     WHERE lower(a.email) = lower($1) AND a.is_active = true
     LIMIT 1`,
    [email]
  );
  const row = result.rows[0];
  if (!row) return null;

  const valid = await bcrypt.compare(password, String(row.password_hash));
  if (!valid) return null;

  return {
    accId: Number(row.id),
    personId: row.person_id == null ? null : Number(row.person_id),
    email: String(row.email),
    fullName: row.full_name == null ? null : String(row.full_name),
  };
}

export async function createAuthCookie(user: AuthUser, options?: { secure?: boolean }) {
  const cookieStore = await cookies();
  const secure = Boolean(options?.secure);
  cookieStore.set(AUTH_COOKIE_NAME, encodeToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  // Non-httpOnly cookie so client-side JS can read identity for UI/localStorage keying
  cookieStore.set('user_id', String(user.accId), {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie(options?: { secure?: boolean }) {
  const cookieStore = await cookies();
  const secure = Boolean(options?.secure);
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  cookieStore.set('user_id', '', {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
}

async function getCustomAuthUserFromCookie(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeToken(token);
}

async function getGoogleAuthUser(): Promise<AuthUser | null> {
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    if (!session?.user?.accId) return null;
    return {
      accId: session.user.accId,
      personId: null,
      email: session.user.email,
      fullName: session.user.fullName,
    };
  } catch {
    return null;
  }
}

// Works for both Google SSO (NextAuth session) and email/password (custom cookie).
// Keep the legacy export name because existing API routes use it for their caller identity.
export async function getAuthUserFromCookie(): Promise<AuthUser | null> {
  const fromCookie = await getCustomAuthUserFromCookie();
  if (fromCookie) return fromCookie;
  return getGoogleAuthUser();
}

export async function getAuthUser(): Promise<AuthUser | null> {
  return getAuthUserFromCookie();
}
