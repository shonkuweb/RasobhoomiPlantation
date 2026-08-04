import React, { createContext, useContext, useState, useEffect } from 'react';
import { uiTranslations, t as tHelper, translateProduct as translateProductHelper } from '../utils/translations';

const LanguageContext = createContext();

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguageState] = useState(() => {
        try {
            return localStorage.getItem('app_language') || 'en';
        } catch {
            return 'en';
        }
    });

    const setLanguage = (newLang) => {
        if (!uiTranslations[newLang]) return;
        setLanguageState(newLang);
        try {
            localStorage.setItem('app_language', newLang);
        } catch (e) {
            console.error('Failed to save language preference', e);
        }
    };

    const t = (key) => tHelper(key, language);
    const translateProduct = (product) => translateProductHelper(product, language);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, translateProduct }}>
            {children}
        </LanguageContext.Provider>
    );
};
