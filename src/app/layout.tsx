import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import LayoutWithSidebar from "@/components/layout/LayoutWithSidebar";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://booking.marysoll.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Marysoll Booking — slobodni termini u salonima lepote",
    template: "%s | Marysoll Booking",
  },
  description:
    "Pronađi i rezerviši slobodne termine u salonima lepote i velnesa širom Srbije — frizeri, manikir, masaža, šminkanje i drugi beauty tretmani. Online, bez poziva i čekanja.",
  openGraph: {
    siteName: "Marysoll Booking",
    type: "website",
    locale: "sr_RS",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sr" data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <QueryProvider>
          <Toaster
            position="top-center"
            containerStyle={{ zIndex: 9999, top: 72 }}
          />
          <LayoutWithSidebar>{children}</LayoutWithSidebar>
        </QueryProvider>
      </body>
    </html>
  );
}
