"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';
import { Languages, Menu, X } from 'lucide-react';

export default function Header() {
  const { lang, toggleLang } = useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: lang === 'en' ? 'Home' : 'मुख्य', href: '/' },
    { name: lang === 'en' ? 'Blogs' : 'लेख', href: '/blogs' },
   
  ];

  return (
    <nav 
      className={`sticky top-0 z-[100] transition-all duration-500 px-6 
      ${isScrolled ? 'py-3 bg-forest shadow-xl' : 'py-5 bg-forest'}`}
    >
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link href="/" className="group flex flex-col">
  <span className="text-xl md:text-2xl font-serif font-bold text-sand leading-none tracking-tight">
    {lang === 'en' ? (
      <>DR. DIXIT <span className="text-saffron">  AYURVEDA</span></>
    ) : (
      <>डॉ. दीक्षित <span className="text-saffron">  आयुर्वेद</span></>
    )}
  </span>
  <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-sand/60 mt-1 hidden md:block">
    {lang === 'en' ? 'Shalya Tantra Specialist' : 'शल्य तंत्र विशेषज्ञ'}
  </span>
</Link>
        
        {/* Desktop Navigation */}
        <div className="hidden lg:flex gap-10 items-center">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              className="relative font-bold text-sm text-sand/80 hover:text-sand transition-colors group"
            >
              {link.name}
              {/* Underline is now Saffron to pop against Green */}
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-saffron transition-all duration-300 group-hover:w-full"></span>
            </Link>
          ))}

          <div className="h-6 w-px bg-sand/10 mx-2"></div>

          {/* Language Toggle - Inverted Colors */}
          <button 
            onClick={toggleLang}
            className="flex items-center gap-2 group hover:bg-white/5 px-3 py-2 rounded-xl transition-all"
          >
            <div className="bg-sand text-forest p-1.5 rounded-lg group-hover:bg-saffron group-hover:text-sand transition-all">
              <Languages size={14} />
            </div>
            <span className="text-xs font-bold text-sand uppercase tracking-wider">
              {lang === 'en' ? 'हिन्दी' : 'English'}
            </span>
          </button>

          {/* CTA Button - Use Saffron to make it the primary focus */}
          <Link href="/consultation" className="btn-vedic !bg-saffron !text-forest !border-saffron hover:!bg-sand hover:!text-forest !py-2.5 !px-6 text-sm shadow-lg active:scale-95 transition-all">
            {lang === 'en' ? 'Book Consultation' : 'परामर्श बुक करें'}
          </Link>
        </div>

        {/* Mobile Toggle */}
        <div className="lg:hidden flex items-center gap-4">
           <button onClick={toggleLang} className="p-2 text-sand">
            <Languages size={20} />
           </button>
           <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-sand p-1">
            {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
           </button>
        </div>
      </div>

      {/* Mobile Menu Overlay - Green Background */}
      {isMobileMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 w-full bg-forest border-t border-white/10 p-6 flex flex-col gap-6 animate-in slide-in-from-top-4 duration-300">
          {navLinks.map((link) => (
            <Link 
              key={link.href} 
              href={link.href} 
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-2xl font-serif font-bold text-sand"
            >
              {link.name}
            </Link>
          ))}
          <Link 
            href="/consultation" 
            className="btn-vedic !bg-saffron !text-forest text-center"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            {lang === 'en' ? 'Book Consultation' : 'परामर्श बुक करें'}
          </Link>
        </div>
      )}
    </nav>
  );
}