import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { privacyContent } from "@/lib/legal/legalContent";

export const metadata: Metadata = {
  title: "Politika privatnosti i kolačića | Marysoll Booking",
  description: privacyContent.description,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Politika privatnosti i kolačića | Marysoll Booking",
    description: privacyContent.description,
    type: "article",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return <LegalPage content={privacyContent} />;
}
