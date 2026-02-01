"use client";
import { 
  ShieldCheck, 
  Mail, 
  Database, 
  Eye, 
  Lock, 
  Share2, 
  Link2, 
  Cookie 
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function PrivacyPolicy() {
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-sand/30 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Saffron side-border and refined shadow styling */}
        <div className="relative bg-white/40 backdrop-blur-md border-l-8 border-saffron rounded-r-[48px] p-8 md:p-16 shadow-xl animate-fade-up">
          
          <div className="flex items-center gap-4 mb-8">
            
              <ShieldCheck className="text-saffron" size={40} />
            
            <h1 className="text-4xl font-serif font-bold text-forest">Privacy Policy</h1>
          </div>

          <div className="space-y-10 text-forest/80 leading-relaxed">
            <p className="text-lg">
              We respect your privacy and are committed to protecting it. This Privacy Policy explains how <strong>www.drdixitayurved.com</strong> collects, uses, and safeguards your personal information.
            </p>

            {/* 1. Information We Collect */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Database size={22}/></div>
                1. Information We Collect
              </h2>
              <p>When you use our website – including booking appointments or submitting forms – we may collect the following personal information:</p>
              <ul className="list-disc pl-12 space-y-2">
                <li>Name and Contact details</li>
                <li>Mobile number and Email address</li>
                <li>Gender, age, and health-related details (voluntarily submitted)</li>
                <li>Location/IP address for analytics</li>
              </ul>
            </section>

            {/* 2. How We Use Your Information */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Eye size={22}/></div>
                2. How We Use Your Information
              </h2>
              <ul className="list-disc pl-12 space-y-2">
                <li>To provide online/offline appointment and surgical services</li>
                <li>To understand your health concerns for accurate consultation</li>
                <li>To send updates or service-related health information</li>
                <li>To improve our overall website experience</li>
              </ul>
            </section>

            {/* 3. Data Security */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Lock size={22}/></div>
                3. Data Security
              </h2>
              <p>We take appropriate technical measures to protect your data. However, please note that no method of transmission over the internet is 100% secure, and you use our digital services at your own risk.</p>
            </section>

            {/* 4. Sharing of Information */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Share2 size={22}/></div>
                4. Sharing of Information
              </h2>
              <p>We do not sell or rent your personal information. Your information may only be shared if:</p>
              <ul className="list-disc pl-12 space-y-2">
                <li>You have given explicit permission</li>
                <li>We are legally required by government authorities</li>
              </ul>
            </section>

            {/* 5. Third-Party Links */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Link2 size={22}/></div>
                5. Third-Party Links
              </h2>
              <p>Our website may contain links to external sites. We are not responsible for their privacy practices. Please review their policies before interacting.</p>
            </section>

            {/* 6. Cookies */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Cookie size={22}/></div>
                6. Cookies
              </h2>
              <p>We use cookies to analyze site traffic and enhance your browsing experience. You may disable cookies in your browser settings at any time.</p>
            </section>

            {/* Contact Footer Section */}
               
            <div className="pt-8 border-t border-forest/10">
             
              
              <p className="font-bold text-forest">Contact Us</p>
              <div className="flex items-center gap-3 mt-2">
                <Mail className="text-saffron" size={20} />
                <span>Email: <strong>drdixitayurveda@gmail.com</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}