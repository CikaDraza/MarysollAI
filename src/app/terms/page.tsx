import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { termsContent } from "@/lib/legal/legalContent";

export const metadata: Metadata = {
  title: "Uslovi korišćenja servisa | Marysoll Booking",
  description: termsContent.description,
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Uslovi korišćenja servisa | Marysoll Booking",
    description: termsContent.description,
    type: "article",
    url: "/terms",
  },
};

export default function TermsPage() {
  return <LegalPage content={termsContent} />;
}
