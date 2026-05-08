import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getDbPool } from '@/lib/db';

export const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AuthUser = {
  accId: number;
  personId: number | null;
  email: string;
  isAdmin: boolean;
  role: string;
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
      isAdmin: Boolean(parsed.isAdmin),
      role: typeof parsed.role === 'string' ? parsed.role : (parsed.isAdmin ? 'admin' : 'pm'),
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
      a.role,
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
    role: typeof row.role === 'string' ? row.role : (row.is_admin ? 'admin' : 'pm'),
    fullName: row.full_name == null ? null : String(row.full_name),
  };
}

export async function createAuthCookie(user: AuthUser) {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  cookieStore.set(AUTH_COOKIE_NAME, encodeToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  // Non-httpOnly cookies so client-side JS can read role + identity for UI/localStorage keying
  cookieStore.set('user_role', user.role, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
  cookieStore.set('user_id', String(user.accId), {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 0,
  });
  cookieStore.set('user_role', '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
    path: '/',
    maxAge: 0,
  });
  cookieStore.set('user_id', '', {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
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
