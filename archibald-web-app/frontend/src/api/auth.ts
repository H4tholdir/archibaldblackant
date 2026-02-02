const API_BASE = ""; // Vite proxy handles /api

export type UserRole = "agent" | "admin";

export interface LoginRequest {
  username: string;
  password: string;
  deviceId?: string;
  platform?: string;
  deviceName?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    username: string;
    fullName: string;
    role: UserRole;
    whitelisted: boolean;
    lastLoginAt: number | null;
    isImpersonating?: boolean;
    realAdminName?: string;
  };
  error?: string;
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  whitelisted: boolean;
  lastLoginAt: number | null;
  isImpersonating?: boolean;
  realAdminName?: string;
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  // Include device info if not already provided
  const { getDeviceId, getDeviceName, getPlatform } =
    await import("../utils/device-id");

  const loginPayload = {
    ...credentials,
    deviceId: credentials.deviceId || getDeviceId(),
    platform: credentials.platform || getPlatform(),
    deviceName: credentials.deviceName || getDeviceName(),
  };

  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginPayload),
  });
  return response.json();
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface GetMeResponse {
  success: boolean;
  data?: {
    user: User;
  };
  error?: string;
}

export async function getMe(token: string): Promise<GetMeResponse> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  // Transform backend format to match expected format
  if (data.success && data.data?.user) {
    return {
      success: true,
      data: {
        user: data.data.user,
      },
    };
  }
  return data;
}

/**
 * Login with username and password (for auto re-auth)
 * Alias for login() with simpler signature
 */
export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<LoginResponse> {
  return login({ username, password });
}
