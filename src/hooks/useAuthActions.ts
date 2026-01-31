"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import toast from "react-hot-toast";
import { AuthUser, LoginResponse, RegisterPayload } from "@/types/auth-types";
import { getUserFromToken } from "@/lib/auth/auth-utils";

export function useAuthActions() {
  const queryClient = useQueryClient();

  // 1. Fetch trenutnog korisnika iz localStorage
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["authUser"],
    queryFn: () => {
      if (typeof window === "undefined") return null;
      const token = localStorage.getItem("assistant_token");
      return token ? getUserFromToken(token) : null;
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
      queryClient.setQueryData(["authUser"], getUserFromToken(data.token));
      toast.success(`Dobrodošli nazad, ${data.user.name}`);
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(error.response?.data?.error || "Prijava nije uspela");
    },
  });

  // 3. Register Mutacija
  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      console.log("Slanje registracije:", payload);
      const { data } = await axios.post<LoginResponse>(
        "/api/external/auth/register",
        payload,
      );
      return data;
    },
    onSuccess: (data) => {
      localStorage.setItem("assistant_token", data.token);
      queryClient.setQueryData(["authUser"], getUserFromToken(data.token));
      toast.success("Uspešno ste se registrovali!");
    },
    onError: (error: AxiosError<{ error: string }>) => {
      toast.error(error.response?.data?.error || "Greška pri registraciji");
    },
  });

  // 4. Logout
  const logout = () => {
    localStorage.removeItem("assistant_token");
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
    logout,
  };
}
