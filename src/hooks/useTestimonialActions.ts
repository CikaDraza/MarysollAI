// hooks/useTestimonialActions.ts
import {
  CreateTestimonialData,
  UpdateTestimonialData,
} from "@/types/testimonials-type";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";

export function useTestimonialActions(token: string) {
  const queryClient = useQueryClient();

  const createTestimonial = useMutation({
    mutationFn: async (testimonialData: CreateTestimonialData) => {
      const { data } = await axios.post(
        "/api/external/testimonials/create",
        testimonialData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data;
    },
    onSuccess: () => {
      // Invalidiramo sve testimonials upite i appointments
      queryClient.invalidateQueries({ queryKey: ["testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
      toast.success("Preporuka uspešno poslata.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      throw err;
    },
  });

  const updateTestimonial = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTestimonialData;
    }) => {
      const { data: response } = await axios.put(
        `/api/external/testimonials/update/${id}`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      toast.success("Preporuka uspešno ažurirana.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      throw err;
    },
  });

  const deleteTestimonial = useMutation({
    mutationFn: async (id: string) => {
      await axios.delete(`/api/external/testimonials/delete/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      toast.success("Preporuka uspešno izbrisana.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      throw err;
    },
  });

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await axios.put(
        `/api/external/testimonials/mark-read/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["admin-testimonials"] });
      queryClient.invalidateQueries({ queryKey: ["unreadTestimonialsCount"] });
      toast.success("Preporuka označena kao pročitana.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      throw err;
    },
  });

  const markClientAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await axios.put(
        `/api/external/testimonials/mark-client-read/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-testimonials"] });
      queryClient.invalidateQueries({
        queryKey: ["unreadTestimonialsCount"],
      });
      toast.success("Preporuka označena kao pročitana.");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
      throw err;
    },
  });

  return {
    createTestimonial,
    updateTestimonial,
    deleteTestimonial,
    markAsRead,
    markClientAsRead,
  };
}
