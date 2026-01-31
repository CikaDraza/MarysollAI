// context/AuthContext.tsx
"use client";
import { createContext, useContext, ReactNode } from "react";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { AuthUser } from "@/types/auth-types";

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthContextType>({ token: null, user: null });

export const AuthProvider = ({
  children,
  token,
}: {
  children: ReactNode;
  token: string | null;
}) => {
  const user = token ? getUserFromToken(token) : null;
  return (
    <AuthContext.Provider value={{ token, user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
