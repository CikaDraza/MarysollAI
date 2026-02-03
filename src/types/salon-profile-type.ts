export interface SalonProfile {
  _id: string;
  name: string;
  email: string;
  description: string;
  logo?: string;
  phone: string;
  street: string;
  city: string;
  social: SocialLinks;
  newsletterEmail: string;
  createdAt?: string;
  updatedAt?: string;
  workingHours?: WorkingHours;
  seo?: SeoData;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  [key: string]: string | undefined;
}

export interface SeoData {
  homeTitle?: string;
  homeDescription?: string;
  uslugeTitle?: string;
  uslugeDescription?: string;
  terminiTitle?: string;
  terminiDescription?: string;
}

export interface WorkingHours {
  Ponedeljak?: string;
  Utorak?: string;
  Sreda?: string;
  Četvrtak?: string;
  Petak?: string;
  Subota?: string;
  Nedelja?: string;
}

export interface DaySchedule {
  open: string; // npr. "09:00"
  close: string; // npr. "20:00"
  isClosed: boolean;
}
