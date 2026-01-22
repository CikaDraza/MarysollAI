import { jwtDecode } from "jwt-decode";
import { AuthUser } from "@/types/auth-types";

export function getUserFromToken(token: string): AuthUser | null {
  try {
    const decoded: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
      token: string;
      exp: number;
    } = jwtDecode(token);
    // Provera da li je token istekao
    if (decoded.exp * 1000 < Date.now()) {
      return null;
    }
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      isAdmin: decoded.isAdmin,
      token: token,
    };
  } catch {
    return null;
  }
}
