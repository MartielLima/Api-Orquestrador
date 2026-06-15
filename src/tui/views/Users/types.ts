export interface UserRow {
  id: string;
  email: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
