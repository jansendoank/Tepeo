export type UserRole = 'user' | 'reseller' | 'partner' | 'admin';

export interface LicenseKey {
  key: string;
  role: UserRole;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null; // null = lifetime
  durationDays: number; // 0 = 1 hour, -1 = lifetime, >0 = days
  isBanned: boolean;
  boundIp?: string;
  boundDevice?: string;
  note?: string;
  lastUsedAt?: number;
}

export interface AuthSession {
  token: string;
  key: string;
  role: UserRole;
  expiresAt: number | null;
  createdAt: number;
  clientIp?: string;
}

export interface TelegramConfig {
  botToken: string;
  adminChatId: string;
  enabled: boolean;
}
