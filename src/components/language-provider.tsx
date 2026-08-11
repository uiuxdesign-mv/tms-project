'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { translations, type Lang, type TranslationKey } from '@/lib/i18n/translations';

const LANG_STORAGE_KEY = 'tms-lang';

type LanguageApi = { lang: Lang; setLang: (l: Lang) => void; t: (key: TranslationKey) => string };

const LanguageContext = createContext<LanguageApi | null>(null);

/** Sama seperti ThemeInitScript — mencegah kedipan bahasa default sebelum React hydrate. */
export function LanguageInitScript() {
  const code = `(function(){try{var l=localStorage.getItem('${LANG_STORAGE_KEY}');if(l==='en'){document.documentElement.setAttribute('data-lang','en');document.documentElement.lang='en';}}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('id');

  useEffect(() => {
    setLangState(document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'id');
  }, []);

  function setLang(next: Lang) {
    setLangState(next);
    document.documentElement.setAttribute('data-lang', next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // localStorage bisa gagal (mis. mode privat) — bahasa tetap berlaku untuk sesi ini saja.
    }
  }

  function t(key: TranslationKey): string {
    return translations[key]?.[lang] ?? key;
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageApi {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() harus dipakai di dalam <LanguageProvider>.');
  return ctx;
}
