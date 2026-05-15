import { jwtDecode } from "jwt-decode";
import { AuthUser } from "@/types/auth-types";

export function getUserFromToken(token: string): AuthUser | null {
  try {
    const decoded = jwtDecode<{
      id?: string;
      _id?: string;
      userId?: string;
      sub?: string;
      email?: string;
      name?: string;
      isAdmin?: boolean;
      role?: string;
      exp?: number;
    }>(token);
    // Provera da li je token istekao
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }
    const id = decoded.id ?? decoded._id ?? decoded.userId ?? decoded.sub;
    if (!id || !decoded.email) return null;

    return {
      id,
      email: decoded.email,
      name: decoded.name ?? decoded.email,
      isAdmin: decoded.isAdmin ?? decoded.role === "admin",
      token: token,
    };
  } catch {
    return null;
  }
}
