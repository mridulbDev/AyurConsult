import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Script from "next/script";
import { LanguageProvider } from "./context/LanguageContext";

// Viewport should be exported separately in Next.js 14+
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b4332", // Forest Green
};

export const metadata: Metadata = {
  title: {
    default: "Prof. Mahesh Dixit | Expert Ayurvedic Surgeon",
    template: "%s | Prof. Mahesh Dixit"
  },
  description: "Consult with Prof. Mahesh Dixit, a renowned Ayurvedic surgeon in Rajasthan with 30+ years of experience in Shalya Tantra (Ayurvedic Surgery), Ksharsutra, and Agnikarma.",
  keywords: ["Ayurvedic Surgeon", "Shalya Tantra", "Mahesh Dixit", "Ksharsutra", "Ayurveda Consultation India", "Expert Ayurvedic Consultant", "Expert Ayurvedic Doctor", "Best Ayurvedic doctor Udaipur", "Best Ayurvedic consultant online", "Ayurveda doctor for online consultation","Ayurveda Online Consultation", "Ayurveda Surgery Expert", "Ayurvedic Treatment Specialist", "Ayurvedic Doctor in Rajasthan"],
  authors: [{ name: "Prof. Mahesh Dixit" }],
  creator: "Prof. Mahesh Dixit",
  icons: {
    icon: [
      {
        url: '/logo.svg',
        type: 'image/svg+xml',
      },
    ],
  },
  // Canonical helps SEO avoid duplicate content issues between en/hi
  alternates: {
    canonical: "https://drdixitayurved.com/", 
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://drdixitayurved.com/",
    title: "Prof. Mahesh Dixit | Expert Ayurvedic Surgeon",
    description: "30+ years of excellence in Ayurvedic Surgery and Shalya Tantra.",
    siteName: "Prof. Mahesh Dixit Ayurveda",
    images: [{ url: "/images/drdixit.png" }], // Create a social share image
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Note: We keep lang="en" as default, but search engines 
    // will read the actual text content on the page.
    <html lang="en" className="scroll-smooth">
      <head>
        {/* Google Fonts - Playfair Display for Serifs */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@300;400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
        
      </head>
      <body className="antialiased bg-sand text-forest">
        <LanguageProvider>
          <Header />
          {/* Min-h-screen ensures footer stays at bottom on short pages */}
          <main className="min-h-[80vh]">
            {children}
          </main>
          <Footer />
        </LanguageProvider>

        {/* Razorpay - Loaded with 'lazyOnload' to improve initial page speed */}
        <Script 
          src="https://checkout.razorpay.com/v1/checkout.js" 
          strategy="lazyOnload" 
        />
      </body>
    </html>
  );
}