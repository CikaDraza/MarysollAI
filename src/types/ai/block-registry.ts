// src/lib/ai/block-registry.ts

import { BlockTypes } from "@/types/block-types";

export interface BlockDescriptor {
  type: BlockTypes;
  title: string;
  description: string;
  action: "read" | "action";
  requiresAuth: boolean;
}

export const BLOCK_REGISTRY: BlockDescriptor[] = [
  {
    type: "LoginBlock",
    title: "Prijava korisnika",
    description: "Forma za prijavu postojećeg korisnika",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "RegisterBlock",
    title: "Registracija korisnika",
    description: "Forma za kreiranje novog naloga",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "AppointmentBlock",
    title: "Zakazivanje termina",
    description: "Forma za izbor usluge, datuma i vremena",
    action: "action",
    requiresAuth: true,
  },
  {
    type: "AppointmentCalendarBlock",
    title: "Kalendar termina",
    description: "Pregled slobodnih i zauzetih termina",
    action: "read",
    requiresAuth: false,
  },
  {
    type: "ServicePriceBlock",
    title: "Cenovnik",
    description: "Lista usluga sa cenama",
    action: "read",
    requiresAuth: false,
  },
  {
    type: "TestimonialBlock",
    title: "Utisci klijenata",
    description: "Prikaz recenzija korisnika",
    action: "read",
    requiresAuth: false,
  },
];
