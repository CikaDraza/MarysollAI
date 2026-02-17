// types/auth-types.ts
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  token: string;
  isOnline?: boolean;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: Omit<AuthUser, "token">;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
  agreedToPrivacy: boolean;
}
