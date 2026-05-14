"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import toast from "react-hot-toast";
import { AuthUser, LoginResponse, RegisterPayload } from "@/types/auth-types";
import { getUserFromToken } from "@/lib/auth/auth-utils";

const PROFILE_KEY = "assistant_user_profile";

function loadProfileSupplement(): { phone?: string; instagram?: string } {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function findStringByKeys(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const nested of Object.values(record)) {
    if (nested && typeof nested === "object") {
      const found = findStringByKeys(nested, keys);
      if (found) return found;
    }
  }
  return undefined;
}

function normalizeProfileContact(user: unknown): { phone?: string; instagram?: string } {
  const phone = findStringByKeys(user, [
    "phone",
    "phoneNumber",
    "mobile",
    "mobilePhone",
    "telephone",
    "contactPhone",
  ]);
  const instagram = findStringByKeys(user, [
    "instagram",
    "instagramUsername",
    "instagramHandle",
    "contactInstagram",
  ]);
  return {
    ...(phone ? { phone } : {}),
    ...(instagram ? { instagram } : {}),
  };
}

export function useAuthActions() {
  const queryClient = useQueryClient();

  // 1. Fetch trenutnog korisnika iz localStorage + supplement (phone, instagram)
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["authUser"],
    queryFn: () => {
      if (typeof window === "undefined") return null;
      const token = localStorage.getItem("assistant_token");
      if (!token) return null;
      const decoded = getUserFromToken(token);
      if (!decoded) return null;
      return { ...decoded, ...loadProfileSupplement() };
    },
    staleTime: Infinity,
  });

  // 2. Login Mutacija
  const loginMutation = useMutation({
    mutationFn: async (
      credentials: Pick<AuthUser, "email"> & { password: string },
    ) => {
      const { data } = await axios.post<LoginResponse>(
        "/api/external/auth/login",
        credentials,
      );
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem("assistant_token", data.token);
      const supplement = normalizeProfileContact(data.user);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(supplement));
      const decoded = getUserFromToken(data.token);
      queryClient.setQueryData(["authUser"], decoded ? { ...decoded, ...supplement } : null);
      toast.success(`Dobrodošli nazad, ${data.user.name}`);
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(error.response?.data?.error || "Prijava nije uspela");
    },
  });

  // 3. Register Mutacija
  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await axios.post<LoginResponse>(
        "/api/external/auth/register",
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem("assistant_token", data.token);
      const supplement = normalizeProfileContact(data.user);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(supplement));
      const decoded = getUserFromToken(data.token);
      queryClient.setQueryData(["authUser"], decoded ? { ...decoded, ...supplement } : null);
      toast.success("Uspešno ste se registrovali!");
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(error.response?.data?.error || "Greška pri registraciji");
    },
  });

  // 5. Forgot Password Mutacija
  const forgotPasswordMutation = useMutation({
    mutationFn: async ({
      email,
      assistantSlug,
      isAssistant,
    }: {
      email: string;
      assistantSlug: string;
      isAssistant: boolean;
    }) => {
      // Ovde gađaš proxy ili direktno rutu na glavnom sajtu
      const { data } = await axios.post("/api/external/auth/forgot-password", {
        email,
        assistantSlug,
        isAssistant,
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Link za resetovanje je poslat na vaš email.");
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(error.response?.data?.error || "Greška pri slanju zahteva");
    },
  });

  // 6. Reset Password Mutacija
  const resetPasswordMutation = useMutation({
    mutationFn: async ({
      token,
      newPassword,
    }: {
      token: string;
      newPassword: string;
    }) => {
      const { data } = await axios.post("/api/external/auth/reset-password", {
        token,
        newPassword,
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Šifra je uspešno promenjena!");
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(
        error.response?.data?.error || "Greška pri resetovanju šifre",
      );
    },
  });

  // 7. Logout
  const logout = () => {
    localStorage.removeItem("assistant_token");
    localStorage.removeItem(PROFILE_KEY);
    queryClient.setQueryData(["authUser"], null);
    toast.success("Odjavljeni ste.");
  };

  return {
    user,
    token: user?.token,
    isLoggedIn: !!user,
    isAdmin: !!user?.isAdmin,
    isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    register: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    forgotPassword: ({
      email,
      assistantSlug,
      isAssistant,
    }: {
      email: string;
      assistantSlug: string;
      isAssistant: boolean;
    }) =>
      forgotPasswordMutation.mutateAsync({ email, assistantSlug, isAssistant }),
    isSendingForgot: forgotPasswordMutation.isPending,
    resetPassword: resetPasswordMutation.mutateAsync,
    isResetting: resetPasswordMutation.isPending,
    logout,
  };
}
