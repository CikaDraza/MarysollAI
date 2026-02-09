// src/lib/ai/block-registry.ts

import { BlockTypes } from "../landing-block";

export interface BlockDescriptor {
  type: BlockTypes;
  title: string;
  description: string;
  action: "read" | "action";
  requiresAuth: boolean;
}

export const BLOCK_REGISTRY: BlockDescriptor[] = [
  {
    type: "AuthBlock",
    title: "Prijava korisnika",
    description: "Forma za prijavu postojećeg korisnika",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "LoginBlock",
    title: "Ulogujte se",
    description: "Forma za prijavu korisnika",
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
    type: "LogoutBlock",
    title: "Odjava korisnika",
    description: "Ako korisnik želi da se izloguje, odjavi, sa naloga",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "AppointmentCalendarBlock",
    title: "Zakazivanje termina",
    description:
      "Zakazivanje termina rucno, popunjavanjem usluge, datuma i vremena. Mogucnost SMART BOOKING, popunjavas automatski uslugu, datum i vreme ako korisnik tacno precizira.",
    action: "action",
    requiresAuth: true,
  },
  {
    type: "CalendarBlock",
    title: "Kalendar termina",
    description: "Pregled slobodnih i zauzetih termina",
    action: "read",
    requiresAuth: true,
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
  {
    type: "ResetPasswordBlock",
    title: "Resetovanje lozinke",
    description: "Forma za promenu lozinke putem tokena",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "ForgotPasswordBlock",
    title: "Zaboravljena lozinka",
    description: "Forma za slanje zahteva za reset lozinke na email",
    action: "action",
    requiresAuth: false,
  },
];
