"use client";

import { useMemo, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useClientTestimonials } from "@/hooks/useClientTestimonials";
import { useTestimonialActions } from "@/hooks/useTestimonialActions";
import { formatISODate } from "@/helpers/formatISODate";
import { IAppointment } from "@/types/appointments-type";
import MiniLoader from "../MiniLoader";
import LoaderButton from "../LoaderButton";
import { Reveal } from "../motion/Reveal";
import {
  ChatBubbleLeftEllipsisIcon,
  ChatBubbleOvalLeftEllipsisIcon,
} from "@heroicons/react/24/outline";
import { getUserFromToken } from "@/lib/auth/auth-utils";
import { ITestimonial } from "@/types/testimonials-type";
import { useSearchParams } from "next/navigation";
import {
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
} from "@heroicons/react/20/solid";
import { useAppointmentsWithToken } from "@/hooks/useAppointmentsWithToken";
import { getToken } from "@/helpers/getToken";

interface Props {
  onActionComplete?: (m: string) => void;
}

export default function TestimonialBlockView({ onActionComplete }: Props) {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("assistant_token");
  const token = tokenFromUrl || getToken();
  const [activeTab, setActiveTab] = useState<"new" | "pending" | "replied">(
    "new",
  );

  const [showForm, setShowForm] = useState(false);
  const [selectedAppointment, setSelectedAppointment] =
    useState<IAppointment | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ rating: 5, comment: "" });
  const [page, setPage] = useState(1);
  const limit = 10;

  if (!token) {
    return toast.error("Niste prijavljeni");
  }
  // Fetch client appointments (from external)
  const { data: appointmentsRes, isLoading: loadingAppointments } =
    useAppointmentsWithToken(token, {
      page,
      limit,
      enabled: !!token,
    });
  const appointments = appointmentsRes?.appointments || [];

  // Fetch client testimonials (from external)
  const {
    data: testimonialsRes,
    isLoading: loadingTestimonials,
    refetch,
  } = useClientTestimonials(token!, {
    page,
    limit,
  });
  const clientTestimonials = testimonialsRes?.testimonials || [];

  const currentUser = getUserFromToken(token!);

  // Determine appointments without testimonial
  const appointmentsWithoutTestimonial = useMemo(() => {
    if (!appointments.length) return [];
    const testimonialAppointmentIds = clientTestimonials
      .map((t) => t.appointmentId?._id || t.appointmentId)
      .filter(Boolean);

    return appointments.filter((app) => {
      // Normalize clientId from the appointment (may be a string or an object)
      const appClientId =
        typeof app.clientId === "string"
          ? app.clientId
          : (app.clientId as any)?._id;

      const isClient = appClientId === currentUser?.id;
      const hasTestimonial = testimonialAppointmentIds.includes(app._id || "");

      return isClient && !hasTestimonial;
    });
  }, [appointments, clientTestimonials, currentUser]);

  // Split testimonials into those with and without admin reply
  const { withoutReply, withReply } = useMemo(() => {
    const without = clientTestimonials.filter((t) => !t.adminReply);
    const withR = clientTestimonials.filter((t) => t.adminReply);
    return { withoutReply: without, withReply: withR };
  }, [clientTestimonials]);

  const { updateTestimonial, markClientAsRead } = useTestimonialActions(token);

  const handleCreateTestimonial = (appointment: IAppointment) => {
    setSelectedAppointment(appointment);
    setShowForm(true);
    // Scroll to form
    setTimeout(() => {
      document
        .getElementById("testimonial-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleFormSuccess = () => {
    onActionComplete?.("USPEŠNO OSTAVLJENA PREPORUKA.");
    setShowForm(false);
    setSelectedAppointment(null);
    refetch();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedAppointment(null);
  };

  const handleEdit = (
    testimonial: ITestimonial<{
      _id: string;
      serviceName: string;
      date: string;
    }>,
  ) => {
    setEditingId(testimonial._id);
    setEditData({ rating: testimonial.rating, comment: testimonial.comment });
  };

  const submitEdit = (testimonialId: string) => {
    updateTestimonial.mutate(
      { id: testimonialId, data: editData },
      {
        onSuccess: () => {
          setEditingId(null);
          refetch();
        },
      },
    );
    onActionComplete?.("USPEŠNO OSTAVLJENA PREPORUKA.");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleClientAsRead = async (testimonialId: string) => {
    markClientAsRead.mutate(testimonialId, {
      onSuccess: () => refetch(),
    });
  };

  const isLoading = loadingAppointments || loadingTestimonials;
  if (isLoading) return <MiniLoader />;

  return (
    <div className="scroll-mt-20">
      <Reveal>
        <div className="bg-white rounded-xl p-1 shadow-xl max-w-7xl mx-auto my-6">
          <Toaster position="top-right" />

          {/* Tabs */}
          {/* Lite Header - Tanji i svedeniji */}
          <div className="flex bg-gray-50/80 p-1 gap-1">
            <button
              onClick={() => setActiveTab("new")}
              className={`cursor-pointer flex-1 flex items-center hover:text-(--secondary-color)/90 justify-center gap-2 py-4 text-xs font-bold rounded-lg transition-all ${
                activeTab === "new"
                  ? "bg-white text-(--secondary-color) shadow-sm"
                  : "text-gray-400"
              }`}
            >
              <PencilSquareIcon className="size-4" />
              Ostavi komentar ({appointmentsWithoutTestimonial.length})
            </button>
            <button
              onClick={() => setActiveTab("pending")}
              className={`cursor-pointer flex-1 flex items-center hover:text-(--secondary-color)/90 justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "pending"
                  ? "bg-white text-(--secondary-color) shadow-sm"
                  : "text-gray-400"
              }`}
            >
              <ChatBubbleLeftEllipsisIcon className="size-4" />
              Vaši komentari ({withoutReply.length})
            </button>
            <button
              onClick={() => setActiveTab("replied")}
              className={`cursor-pointer flex-1 flex items-center hover:text-(--secondary-color)/90 justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "replied"
                  ? "bg-white text-(--secondary-color) shadow-sm"
                  : "text-gray-400"
              }`}
            >
              <ChatBubbleLeftRightIcon className="size-4" />
              Odgovori salona ({withReply.length})
            </button>
          </div>
          {/* Tab content */}
          <div>
            {activeTab === "new" && (
              <>
                {showForm && selectedAppointment && (
                  <TestimonialForm
                    appointment={selectedAppointment}
                    onSuccess={handleFormSuccess}
                    onCancel={handleFormCancel}
                  />
                )}
                {appointmentsWithoutTestimonial.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Nemate termine koji čekaju komentar.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {appointmentsWithoutTestimonial.map((app) => (
                      <div
                        key={app._id}
                        className="flex justify-between items-center p-4 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {app.serviceName}
                          </p>
                          <p className="text-sm text-gray-600">
                            {new Date(app.date).toLocaleDateString("sr-RS")} u{" "}
                            {app.time}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCreateTestimonial(app)}
                          className="bg-(--secondary-color) text-white p-3 rounded-full hover:bg-(--secondary-color)/80 transition-colors"
                        >
                          <ChatBubbleOvalLeftEllipsisIcon className="size-5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "pending" && (
              <>
                {withoutReply.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Niste ostavili nijedan komentar bez odgovora.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {withoutReply.map((testimonial) => (
                      <TestimonialItem
                        key={testimonial._id}
                        testimonial={testimonial}
                        editingId={editingId}
                        editData={editData}
                        onEdit={handleEdit}
                        onSubmitEdit={submitEdit}
                        onCancelEdit={cancelEdit}
                        onMarkClientRead={handleClientAsRead}
                        setEditData={setEditData}
                        updatePending={updateTestimonial.isPending}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "replied" && (
              <>
                {withReply.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>Još uvek nema odgovora salona na vaše komentare.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {withReply.map((testimonial) => (
                      <TestimonialItem
                        key={testimonial._id}
                        testimonial={testimonial}
                        editingId={editingId}
                        editData={editData}
                        onEdit={handleEdit}
                        onSubmitEdit={submitEdit}
                        onCancelEdit={cancelEdit}
                        onMarkClientRead={handleClientAsRead}
                        setEditData={setEditData}
                        updatePending={updateTestimonial.isPending}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

// Helper components (same as in original but with minor adjustments)
interface TestimonialFormProps {
  appointment: IAppointment;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function TestimonialForm({
  appointment,
  onSuccess,
  onCancel,
}: TestimonialFormProps) {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("assistant_token");
  const token = tokenFromUrl || getToken();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (!token) {
    return toast.error("Niste prijavljeni");
  }

  const { createTestimonial } = useTestimonialActions(token);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createTestimonial.mutateAsync({
        appointmentId: appointment._id!,
        rating,
        comment,
      });
      setComment("");
      setRating(5);
      onSuccess?.();
    } catch (error) {
      console.error("Mutation failed", error);
    }
  };

  return (
    <form
      id="testimonial-form"
      onSubmit={handleSubmit}
      className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm mb-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Ostavite komentar za termin: {appointment.serviceName}
      </h3>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Ocena:
        </label>
        <div className="flex space-x-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="text-3xl focus:outline-none transition-transform hover:scale-110"
            >
              {star <= rating ? (
                <span className="text-yellow-400">★</span>
              ) : (
                <span className="text-gray-300">☆</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Komentar:
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Podelite svoje iskustvo sa nama..."
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-(--primary-color) focus:border-transparent"
          rows={4}
          required
          minLength={10}
        />
        <p className="text-xs text-gray-500 mt-1">Minimalno 10 karaktera</p>
      </div>
      <div className="flex space-x-3">
        <button
          type="submit"
          disabled={createTestimonial.isPending || comment.length < 10}
          className="bg-(--primary-color) text-white font-semibold px-6 py-2 rounded-md hover:bg-(--secondary-color) disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {createTestimonial.isPending ? <LoaderButton /> : "Pošalji komentar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-200 text-gray-900 px-6 py-2 rounded-md hover:bg-gray-300 transition-colors"
          >
            Otkaži
          </button>
        )}
      </div>
    </form>
  );
}

interface TestimonialItemProps {
  testimonial: ITestimonial<{
    _id: string;
    serviceName: string;
    date: string;
  }>;
  editingId: string | null;
  editData: { rating: number; comment: string };
  onEdit: (
    testimonial: ITestimonial<{
      _id: string;
      serviceName: string;
      date: string;
    }>,
  ) => void;
  onSubmitEdit: (id: string) => void;
  onCancelEdit: () => void;
  onMarkClientRead?: (id: string) => void;
  setEditData: React.Dispatch<
    React.SetStateAction<{ rating: number; comment: string }>
  >;
  updatePending: boolean;
}

function TestimonialItem({
  testimonial,
  editingId,
  editData,
  onEdit,
  onSubmitEdit,
  onCancelEdit,
  onMarkClientRead,
  setEditData,
  updatePending,
}: TestimonialItemProps) {
  const isEditing = editingId === testimonial._id;

  return (
    <div className="rounded-lg p-6 bg-gray-50">
      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ocena:
            </label>
            <div className="flex space-x-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() =>
                    setEditData((prev) => ({ ...prev, rating: star }))
                  }
                  className="text-yellow-400 text-3xl focus:outline-none transition-transform hover:scale-110"
                >
                  {star <= editData.rating ? "★" : "☆"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Komentar:
            </label>
            <textarea
              value={editData.comment}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, comment: e.target.value }))
              }
              className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-(--primary-color) focus:border-transparent"
              rows={4}
            />
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => onSubmitEdit(testimonial._id)}
              disabled={updatePending}
              className="bg-(--primary-color) text-white px-6 py-2 rounded-md hover:bg-(--primary-color)/90 disabled:opacity-50 transition-colors"
            >
              {updatePending ? "Čuvanje..." : "Sačuvaj promene"}
            </button>
            <button
              onClick={onCancelEdit}
              className="bg-gray-200 text-gray-900 px-6 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Otkaži
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col lg:flex-row justify-between items-start mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-gray-900 text-lg">
                  {testimonial.clientName} -{" "}
                  {testimonial.appointmentId?.serviceName || "Nepoznata usluga"}{" "}
                  -{" "}
                  <span className="text-xs lg:text-md text-gray-500 font-normal">
                    {formatISODate(testimonial.updatedAt)}
                  </span>
                </h3>
                {testimonial.adminReply && !testimonial.isClientRead && (
                  <div className="relative flex items-center gap-2">
                    <div className="flex-none rounded-full bg-purple-500/20 p-1">
                      <div className="size-2.5 rounded-full animate-pulse bg-purple-500" />
                    </div>
                    <span className="text-xs text-purple-600 font-medium">
                      Nov odgovor
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex text-yellow-400 text-xl">
                {"★".repeat(testimonial.rating)}
                {"☆".repeat(5 - testimonial.rating)}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => onEdit(testimonial)}
                  className="text-(--primary-color) hover:text-(--primary-color)/80 text-sm font-medium underline cursor-pointer"
                >
                  Izmeni
                </button>
                {testimonial.adminReply &&
                  !testimonial.isClientRead &&
                  onMarkClientRead && (
                    <button
                      onClick={() => onMarkClientRead(testimonial._id)}
                      className="text-red-600 hover:text-red-700 underline text-xs lg:text-sm font-medium cursor-pointer"
                    >
                      Označi pročitanim
                    </button>
                  )}
              </div>
            </div>
          </div>
          <p className="text-gray-700 mb-4 text-base leading-relaxed">
            {testimonial.comment}
          </p>
          {testimonial.adminReply && (
            <div className="bg-(--secondary-color)/10 p-4 rounded-xl border border-(--secondary-color)/20">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                Odgovor salona:
              </p>
              <p className="text-gray-700 text-base leading-relaxed">
                {testimonial.adminReply}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
