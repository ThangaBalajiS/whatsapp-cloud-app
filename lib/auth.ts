import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export type AuthenticatedUser = {
  email: string;
  name?: string;
  id: string;
};

const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET_KEY || 'default-secret-key-for-local-dev-only'
);

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function createSessionToken(user: AuthenticatedUser): Promise<string> {
  return await new SignJWT({ email: user.email, id: user.id, name: user.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d') // 7 days
    .sign(SECRET_KEY);
}

export async function getUserFromSession(token: string | undefined): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      email: payload.email as string,
      id: payload.id as string,
      name: payload.name as string,
    };
  } catch (error) {
    return null;
  }
}
