
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../utils/translations';
import { loadUserPrefs, saveUserPrefs } from '../services/storageService';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof TRANSLATIONS['en'], params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const prefs = loadUserPrefs();
    return prefs.language || 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    const prefs = loadUserPrefs();
    saveUserPrefs({ ...prefs, language: lang });
  };

  const t = (key: keyof typeof TRANSLATIONS['en'], params?: Record<string, string | number>) => {
    let text = TRANSLATIONS[language][key] || TRANSLATIONS['en'][key] || key;
    
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, String(v));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
