"use client";
import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'hi';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  // Initialize with 'en' but we will check localStorage immediately
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    const savedLang = localStorage.getItem('preferredLang') as Language;
    if (savedLang && (savedLang === 'en' || savedLang === 'hi')) {
      setLangState(savedLang);
    }
  }, []);

  const toggleLang = () => {
    setLangState((prev) => {
      const next = prev === 'en' ? 'hi' : 'en';
      localStorage.setItem('preferredLang', next);
      return next;
    });
  };

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    localStorage.setItem('preferredLang', newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider");
  return context;
};