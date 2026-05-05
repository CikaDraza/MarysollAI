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
  {
    type: "WhyChooseUsBlock",
    title: "O Nama",
    description:
      "zašto izabrati nas, šta mi to radimo, o nama. Mogu da pogledaju više detalja u ovo bloku. Ako imaju sumnju, ko smo pokazati im ovaj blok.",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "CityListBlock",
    title: "Lista Gradova Gde Radimo",
    description:
      "Gradovi u kojima su saloni koji saradjuju sa nama, delimo njihove usluge, preporucujemo slobodne termine za salone u tim gradovima. Prikazati kada korisnik trazi za specifican grad salon ili uslugu.",
    action: "action",
    requiresAuth: false,
  },
  {
    type: "SalonListBlock",
    title: "Lista Gradova Gde Radimo",
    description:
      "Saloni u gradu, saloni koji su na nasoj platformi Marysoll. Prikazati kada zele jos neke usluge istog salona, time dobijaju sve slobodne termine sada, sutra, sve njihove usluge, cene i link ka sajtu.",
    action: "action",
    requiresAuth: false,
  },
];
