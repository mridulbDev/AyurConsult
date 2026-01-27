import { Facebook, Youtube, MessageCircle, GraduationCap } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-forest text-sand pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-12 border-b border-white/10 pb-12">
        <div className="space-y-4">
          <h3 className="text-xl font-serif font-bold text-saffron">Prof. Mahesh Dixit</h3>
          <p className="text-sm opacity-80">
            M.D., Ph.D. (Ayurveda). <br/>
            Specialist in Shalya Tantra & Ayurvedic Surgery.
          </p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-saffron"><Facebook size={20} /></a>
            <a href="#" className="hover:text-saffron"><Youtube size={20} /></a>
            <a href="#" className="hover:text-saffron"><MessageCircle size={20} /></a>
          </div>
        </div>
        
        <div className="text-center">
          <GraduationCap className="mx-auto mb-4 text-saffron/40" size={48} />
          <p className="italic font-serif">"Healing through classical wisdom and modern precision."</p>
        </div>

        <div className="md:text-right space-y-2">
          <h4 className="font-bold text-saffron uppercase text-xs tracking-widest">Consultation</h4>
          <p className="text-sm">Available for Online & Offline Sessions</p>
          <p className="text-sm opacity-60">Bhiwadi, Rajasthan, India</p>
        </div>
      </div>
      <p className="text-center mt-8 text-xs opacity-40">© 2026 Prof. Mahesh Dixit Ayurveda. All rights reserved.</p>
    </footer>
  );
}