import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import Script from "next/script";

export const metadata: Metadata = {
  title: {
    default: "Keiro - Créez des visuels marketing IA qui surfent sur l'actualité",
    template: "%s | Keiro"
  },
  description: "Générez des visuels marketing professionnels en quelques secondes grâce à l'IA. Associez votre business aux actualités tendances pour maximiser l'engagement sur les réseaux sociaux.",
  keywords: [
    "création visuelle IA",
    "marketing visuel",
    "actualités marketing",
    "contenu réseaux sociaux",
    "génération image IA",
    "marketing automation",
    "visuels Instagram",
    "design automatique",
    "IA marketing",
    "content marketing"
  ],
  authors: [{ name: "Keiro" }],
  creator: "Keiro",
  publisher: "Keiro",
  metadataBase: new URL("https://www.keiroai.com"),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: "https://www.keiroai.com",
    title: "Keiro - Créez des visuels marketing IA qui surfent sur l'actualité",
    description: "Générez des visuels marketing professionnels en quelques secondes grâce à l'IA. Associez votre business aux actualités tendances.",
    siteName: "Keiro",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Keiro - Visuels marketing IA"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Keiro - Visuels marketing IA sur l'actualité",
    description: "Générez des visuels marketing professionnels en quelques secondes grâce à l'IA.",
    images: ["/og-image.png"],
    creator: "@KeiroAI"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  },
  verification: {
    google: "GBiYrzZLyQOJtgVQfkuYsjiow2tjc2n1IQvBKgdgYiA"
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        {/* Structured Data JSON-LD */}
        <Script
          id="structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "Keiro",
              "applicationCategory": "BusinessApplication",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "EUR"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "127"
              },
              "description": "Plateforme IA de création de visuels marketing basés sur l'actualité pour maximiser l'engagement sur les réseaux sociaux."
            })
          }}
        />
      </head>
      <body className="bg-white text-neutral-900">
        <Header />
        <main className="pb-20 lg:pb-0">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
