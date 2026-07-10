import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import CookieConsent from "@/components/CookieConsent";
import Script from "next/script";
import { LanguageProvider } from "@/lib/i18n/context";
import { ThemeProvider } from "@/lib/theme/context";
import NewsPrefetcher from "@/components/NewsPrefetcher";
import ChatbotWidget from "@/components/ChatbotWidget";
import GlobalNotifBubble from "@/components/GlobalNotifBubble";
import { VortexBackground } from "@/components/ui/vortex-bg";
import { StickyCtaBar } from "@/components/ui/StickyCtaBar";

export const metadata: Metadata = {
  title: {
    default: "KeiroAI — Ton équipe d'agents IA marketing pour commerces locaux | 49€/mois",
    template: "%s | KeiroAI"
  },
  description: "7 agents IA qui publient sur tes réseaux, prospectent et répondent à tes clients 24/7. Essai gratuit 7 jours.",
  keywords: [
    "agents IA marketing",
    "marketing automation commerce local",
    "publication réseaux sociaux automatique",
    "prospection automatisée",
    "community manager IA",
    "marketing Instagram TikTok",
    "IA marketing PME",
    "agent IA réseaux sociaux"
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
    title: "KeiroAI — Ton équipe d'agents IA marketing pour commerces locaux",
    description: "7 agents IA qui publient sur tes réseaux, prospectent et répondent à tes clients 24/7. Essai gratuit 7 jours.",
    siteName: "KeiroAI",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "KeiroAI - Équipe d'agents IA marketing"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "KeiroAI — Ton équipe d'agents IA marketing 24/7",
    description: "7 agents IA qui publient, prospectent et répondent à tes clients. Essai gratuit 7 jours.",
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
        {/* Consent Mode v2 — DÉFAUT refusé (conformité UE) : GTM/gtag ne posent
            aucun cookie tant que l'utilisateur n'a pas accepté via la bannière.
            Doit s'exécuter AVANT le chargement de GTM. */}
        <Script
          id="consent-default"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('consent','default',{
                ad_storage:'denied', ad_user_data:'denied', ad_personalization:'denied',
                analytics_storage:'denied', functionality_storage:'granted',
                security_storage:'granted', wait_for_update:500
              });
              try {
                var m = /(?:^|;\\s*)keiro_cookie_consent=(granted|denied)/.exec(document.cookie);
                var consent = (m && m[1]) || localStorage.getItem('keiro_cookie_consent');
                if (consent === 'granted') {
                  gtag('consent','update',{
                    ad_storage:'granted', ad_user_data:'granted',
                    ad_personalization:'granted', analytics_storage:'granted'
                  });
                }
              } catch(e){}
            `
          }}
        />

        {/* Google Tag Manager */}
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-TK34L9W6');
            `
          }}
        />

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
                "price": "49",
                "priceCurrency": "EUR"
              },
              "description": "Équipe d'agents IA marketing pour commerces locaux : publication réseaux sociaux, prospection et réponses clients en autonomie."
            })
          }}
        />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-TK34L9W6"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          ></iframe>
        </noscript>

        <ThemeProvider>
        <LanguageProvider>
          <VortexBackground />
          <Header />
          <NewsPrefetcher />
          <main className="relative pb-20 lg:pb-0" style={{ zIndex: 2 }}>
            {children}
          </main>
          <BottomNav />
          <StickyCtaBar />
          <GlobalNotifBubble />
          <ChatbotWidget />
          <CookieConsent />
        </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
