import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';

export interface AccessPayload {
  sub: string;
  email?: string;
  role?: string;
}
export interface RefreshPayload {
  sub: string;
}

interface JwtOpts {
  secret: Secret;
  expiresIn: SignOptions['expiresIn'];
}

export function signAccessToken(payload: AccessPayload, opts: JwtOpts): string {
  return jwt.sign(payload, opts.secret, { expiresIn: opts.expiresIn });
}

export function signRefreshToken(payload: RefreshPayload, opts: JwtOpts): string {
  return jwt.sign(payload, opts.secret, { expiresIn: opts.expiresIn });
}

export function verifyAccessToken(token: string, opts: { secret: Secret }): AccessPayload {
  return jwt.verify(token, opts.secret) as AccessPayload;
}

export function verifyRefreshToken(token: string, opts: { secret: Secret }): RefreshPayload {
  return jwt.verify(token, opts.secret) as RefreshPayload;
}
