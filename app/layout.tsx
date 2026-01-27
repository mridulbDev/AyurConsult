import type { Metadata } from "next";
import "./globals.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Prof. Mahesh Dixit | Expert Ayurvedic Surgeon",
  description: "Consult with Prof. Mahesh Dixit, a renowned Ayurvedic surgeon with 23+ years of experience in Shalya Tantra.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts for the 'Vedic' look */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Header />
        <main>{children}</main>
        <Footer />
        {/* Razorpay Script */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      </body>
    </html>
  );
}