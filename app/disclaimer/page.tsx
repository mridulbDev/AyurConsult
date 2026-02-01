"use client";
import { 
  Scale, 
  Info, 
  Stethoscope, 
  Video, 
  ShieldAlert, 
  ExternalLink, 
  AlertCircle,Mail
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Disclaimer() {
  const { lang } = useLanguage();

  return (
    <div className="min-h-screen bg-sand/30 py-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Updated side-line to saffron to match the rest of the site */}
        <div className="relative bg-white/40 backdrop-blur-md border-l-8 border-saffron rounded-r-[48px] p-8 md:p-16 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <Scale className="text-saffron" size={40} />
            <h1 className="text-4xl font-serif font-bold text-forest">Disclaimer</h1>
          </div>

          <div className="space-y-10 text-forest/80 leading-relaxed">
            <p className="bg-forest/5 p-6 rounded-2xl border border-forest/10 italic text-forest">
              Welcome to <strong>www.drdixitayurved.com</strong>. This website is intended to provide general information about Ayurveda, health awareness, and online/offline consultation services. By using this website, you acknowledge and agree to the following disclaimer terms.We may update this disclaimer from time to time without prior notice. Please check this page periodically for any changes.
            </p>
            
              
            

            {/* 1. General Information */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Info size={22}/></div>
                1. General Information
              </h2>
              <p>The content on this website, including blogs, articles, and other materials, is for educational and informational purposes only. It is not intended to be a substitute for professional medical advice, diagnosis, or treatment.</p>
            </section>

            {/* 2. Not a Substitute for Medical Advice */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Stethoscope size={22}/></div>
                2. Not a Substitute for Medical Advice
              </h2>
              <p>Information shared on this site should not be considered as personal medical guidance. Always consult a qualified Ayurvedic physician or healthcare provider before starting any treatment or medication.</p>
            </section>

            {/* 3. Consultation Disclaimer */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><Video size={22}/></div>
                3. Consultation Disclaimer
              </h2>
              <p>Online and offline consultations provided through this platform are based solely on the information shared by the user. Due to the limitations of remote consultation, we may not be able to assess conditions requiring physical examination.</p>
            </section>

            {/* 4. No Guarantees */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><ShieldAlert size={22}/></div>
                4. No Guarantees
              </h2>
              <p>Treatments, herbal remedies, or advice offered through this site are subject to individual response and constitution. We do not guarantee specific results as outcomes vary from person to person.</p>
            </section>

            {/* 5. External Links */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><ExternalLink size={22}/></div>
                5. External Links
              </h2>
              <p>This website may contain links to external websites. We do not take responsibility for the content, accuracy, or practices of third-party sites linked from here.</p>
            </section>

            {/* 6. Limitation of Liability */}
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-forest flex items-center gap-3">
                <div className="p-2 bg-saffron/10 rounded-lg text-saffron"><AlertCircle size={22}/></div>
                6. Limitation of Liability
              </h2>
              <p><strong>DrDixitAyurved.com</strong> and its operators shall not be held liable for any direct, indirect, or consequential damages arising from the use or misuse of information or services provided on this website.</p>
            </section>

           
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