"use client";
import { Facebook, Youtube, MessageCircle, GraduationCap, Mail, MapPin, Phone,Leaf } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import Link from 'next/link';

export default function Footer() {
  const { lang } = useLanguage();

  const t = {
    drName: lang === 'en' ? 'Dr. Mahesh Dixit' : 'डॉ. महेश दीक्षित', 
    legal: lang === 'en' ? 'Legal & Support' : 'कानूनी और सहायता',
    privacy: lang === 'en' ? 'Privacy Policy' : 'गोपनीयता नीति',
    disclaimer: lang === 'en' ? 'Disclaimer' : 'अस्वीकरण',
    refund: lang === 'en' ? 'Refund Policy' : 'रिफंड नीति',
    address: lang === 'en' ? '425/H-1 Road, Bhupalpura, Udaipur' : '425/एच.-1 रोड, भूपालपुरा, उदयपुर',
    clinicName: lang === 'en' ? 'Dr. Dixit Ayurveda Clinic' : 'डॉ. दीक्षित आयुर्वेद क्लिनिक',
    bookCall: lang === 'en' ? 'Book Consultation' : 'परामर्श बुक करें'
  };

  return (
    <footer className="bg-forest text-sand pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-12 border-b border-white/10 pb-12">
        {/* Profile Section */}
        <div className="space-y-4">
          <h3 className="text-xl font-serif font-bold text-saffron">{t.drName}</h3>
          <p className="text-sm opacity-80 leading-relaxed">
            {lang === 'en' 
              ? 'M.D., Ph.D. (Ayurveda). Specialist in Shalya Tantra & Ayurvedic Surgery.' 
              : 'एम.डी., पीएच.डी. (आयुर्वेद)। शल्य तंत्र और आयुर्वेदिक सर्जरी के विशेषज्ञ।'}
          </p>
          <div className="flex gap-4 pt-2">
            
            <a href="https://www.youtube.com/@drdixitayurveda" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-saffron hover:text-forest transition-all"><Youtube size={18} /></a>
            
          </div>
        </div>

        {/* Quick Links / Legal */}
        <div className="space-y-4">
          <h4 className="font-bold text-saffron uppercase text-xs tracking-widest">{t.legal}</h4>
          <ul className="space-y-2 text-sm opacity-70">
            <li><Link href="/privacy-policy" className="hover:text-saffron transition-colors">{t.privacy}</Link></li>
            <li><Link href="/disclaimer" className="hover:text-saffron transition-colors">{t.disclaimer}</Link></li>
            <li><Link href="/refund-policy" className="hover:text-saffron transition-colors">{t.refund}</Link></li>
          </ul>
        </div>

        {/* Clinic Location */}
        <div className="space-y-4">
          <h4 className="font-bold text-saffron uppercase text-xs tracking-widest">
            {lang === 'en' ? 'Our Address' : 'हमारा पता'}
          </h4>
          <div className="space-y-3 text-sm opacity-70">
            <p className="font-bold text-sand opacity-100">{t.clinicName}</p>
            <div className="flex gap-3">
              <MapPin size={18} className="text-saffron shrink-0" />
              <span>{t.address}</span>
            </div>
            <div className="flex gap-3">
              <Mail size={18} className="text-saffron shrink-0" />
              <a href="mailto:drdixitayurveda@gmail.com" className="hover:underline">drdixitayurveda@gmail.com</a>
            </div>
          </div>
        </div>

        {/* Consultation CTA */}
        <div className="md:text-right space-y-4">
          <h4 className="font-bold text-saffron uppercase text-xs tracking-widest">
            {lang === 'en' ? 'Consultation' : 'परामर्श'}
          </h4>
          <p className="text-sm opacity-70">
            {lang === 'en' ? 'Available for Online & Offline Sessions' : 'ऑनलाइन और ऑफलाइन सत्र के लिए उपलब्ध'}
          </p>
          <div className="flex md:justify-end gap-2 pt-2">
             <Link href="/consultation" className="btn-vedic !bg-saffron !text-forest !border-saffron hover:!bg-sand hover:!text-forest !py-2.5 !px-6 text-sm shadow-lg active:scale-95 transition-all">
            {lang === 'en' ? 'Book Consultation' : 'परामर्श बुक करें'}
          </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs opacity-40">
          © 2026 {t.drName}. {lang === 'en' ? 'All rights reserved.' : 'सर्वाधिकार सुरक्षित।'}
        </p>
        <div className="flex items-center gap-2 opacity-30 italic text-[10px]">
          <Leaf size={14} />
          <span>{lang === 'en' ? 'Classical Wisdom, Modern Precision' : 'शास्त्रीय ज्ञान, आधुनिक सटीकता'}</span>
        </div>
      </div>
    </footer>
  );
}