// src/hooks/useAIAppointment.ts
import { useMemo, useState } from "react";
import { AppointmentCalendarBlockType } from "@/types/landing-block";
import { IService } from "@/types/services-type";
import { AuthUser } from "@/types/auth-types";
import { IAppointment } from "@/types/appointments-type";
import { useAppointmentMutations } from "./useAppointmentMutations";
import toast from "react-hot-toast";

interface UseAIAppointmentProps {
  block: AppointmentCalendarBlockType;
  services: IService[];
  user?: AuthUser | null;
  onSuccess?: (msg: string) => void;
}

export function useAIAppointment({
  block,
  services,
  user,
  onSuccess,
}: UseAIAppointmentProps) {
  const { createAppointment } = useAppointmentMutations(user?.token);

  // 1. Manuelni state (korisničke korekcije)
  const [manualServiceId, setManualServiceId] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState<string | null>(null);
  const [manualVariantName, setManualVariantName] = useState<string | null>(
    null,
  );

  // 2. Destruktuiranje AI predloga da bi React Compiler lakše pratio zavisnosti
  const aiServiceName = block.metadata?.serviceName;
  const aiVariantName = block.metadata?.variantName;
  const aiDate = block.metadata?.date;
  const aiTime = block.metadata?.time;
  const query = block.query;

  // 3. Lookup predložene usluge
  const suggestedService = useMemo(() => {
    if (!query || aiServiceName) return null;
    const findService = query || aiServiceName;
    return services.find((s) =>
      s.name.toLowerCase().includes(findService.toLowerCase()),
    );
  }, [services, query, aiServiceName]);

  // 4. Finalne izvedene vrednosti (Ono što UI prikazuje)
  const serviceId =
    manualServiceId || suggestedService?._id || block.selectedServiceId || "";
  const selectedService = useMemo(
    () => services.find((s) => s._id === serviceId),
    [services, serviceId],
  );

  const selectedDate =
    manualDate || aiDate || new Date().toISOString().split("T")[0];
  const selectedTime = manualTime || aiTime || "";

  const activeVariant = useMemo(() => {
    if (!selectedService || selectedService.type !== "variant") return null;
    const targetName = manualVariantName || aiVariantName;
    if (!targetName) return selectedService.variants?.[0] || null;
    if (!selectedService?.variants) return null;

    return (
      selectedService.variants?.find((v) =>
        v.name.toLowerCase().includes(targetName.toLowerCase()),
      ) || selectedService.variants[0]
    );
  }, [selectedService, manualVariantName, aiVariantName]);

  // 5. Funkcija za slanje (mutacija)
  const handleAIConfirm = async () => {
    if (!user) {
      toast.error("Morate biti prijavljeni.");
      return;
    }
    if (!selectedService || !selectedTime) {
      toast.error("Nedostaju podaci za zakazivanje.");
      return;
    }

    const price = activeVariant?.price || selectedService.basePrice || 0;
    const duration = activeVariant?.duration || selectedService.duration || 60;

    const payload: IAppointment = {
      clientId: user.id,
      clientName: user.name,
      clientEmail: user.email,
      serviceName: `${selectedService.name}${activeVariant ? ` - ${activeVariant.name}` : ""}`,
      services: [
        {
          serviceId: selectedService._id,
          serviceName: selectedService.name || block.query,
          quantity: 1,
          price,
          duration,
          variants: activeVariant ? [activeVariant] : undefined,
        },
      ],
      duration,
      date: selectedDate,
      time: selectedTime,
      status: "pending",
      messages: [],
      adminNotified: true,
      clientNotified: false,
    };

    try {
      await createAppointment.mutateAsync(payload);
      if (onSuccess) {
        onSuccess(
          `ZAKAZANO: za ${selectedDate} u ${selectedTime}. Hvala na pomoći`,
        );
      }
    } catch (e: unknown) {
      toast.error(
        (e instanceof Error && e.message) || "Greška pri zakazivanju.",
      );
      toast.error(
        (e instanceof Error && e.message) || "Greška pri zakazivanju.",
      );
    }
  };

  return {
    // Vrednosti za UI
    displayValues: {
      serviceId,
      selectedDate,
      selectedTime,
      selectedService,
      activeVariant,
      isAiSuggested: !!suggestedService && !manualServiceId,
    },
    // Setteri za promenu (kada korisnik klikne u kalendaru)
    setters: {
      setServiceId: setManualServiceId,
      setDate: setManualDate,
      setTime: setManualTime,
      setVariantName: setManualVariantName,
    },
    // Akcije
    handleAIConfirm,
    isPending: createAppointment.isPending,
  };
}
