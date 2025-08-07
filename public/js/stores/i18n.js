export const i18n = {
  currentLocale: localStorage.getItem('locale') || 'en',
  translations: {},
  loadedLocales: new Set(),

  async init() {
    await this.loadLocale(this.currentLocale);
  },

  async loadLocale(locale) {
    if (this.loadedLocales.has(locale)) return;
    
    try {
      const response = await fetch(`/locales/${locale}.json`);
      if (!response.ok) throw new Error(`Failed to load locale: ${locale}`);
      
      this.translations[locale] = await response.json();
      this.loadedLocales.add(locale);
    } catch (error) {
      console.error(`Error loading locale ${locale}:`, error);
      if (locale !== 'en') {
        await this.loadLocale('en');
      }
    }
  },

  async setLocale(locale) {
    await this.loadLocale(locale);
    this.currentLocale = locale;
    localStorage.setItem('locale', locale);
    document.documentElement.lang = locale;
    
    // Force Alpine to update
    if (window.Alpine && window.Alpine.store('i18n')) {
      window.Alpine.store('i18n').currentLocale = locale;
    }
  },

  t(key, params = {}) {
    if (!this.translations[this.currentLocale]) {
      return key;
    }
    
    const keys = key.split('.');
    let translation = this.translations[this.currentLocale];
    
    for (const k of keys) {
      if (!translation || typeof translation !== 'object') {
        return key;
      }
      translation = translation[k];
    }
    
    if (typeof translation !== 'string') {
      return key;
    }
    
    return Object.entries(params).reduce((str, [key, value]) => 
      str.replace(new RegExp(`\\{${key}\\}`, 'g'), value), translation
    );
  },

  get availableLocales() {
    return [
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'ru', name: 'Русский', flag: '🇷🇺' }
    ];
  }
};