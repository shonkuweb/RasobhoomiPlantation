import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

    const [aiTranslationsMap, setAiTranslationsMap] = useState({});
    const [isTranslating, setIsTranslating] = useState(false);

    const fetchGroqTranslations = useCallback(async (targetLang) => {
        if (targetLang === 'en') return;
        setIsTranslating(true);
        try {
            const res = await fetch(`/api/products/translations?lang=${targetLang}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.products)) {
                    const newMap = {};
                    data.products.forEach(p => {
                        if (p && p.id) {
                            newMap[p.id] = p;
                        }
                    });
                    setAiTranslationsMap(prev => ({
                        ...prev,
                        [targetLang]: newMap
                    }));
                }
            }
        } catch (err) {
            console.error('Failed to fetch Groq AI translations:', err);
        } finally {
            setIsTranslating(false);
        }
    }, []);

    useEffect(() => {
        if (language !== 'en') {
            fetchGroqTranslations(language);
        }
    }, [language, fetchGroqTranslations]);

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

    const translateProduct = (product) => {
        if (!product) return product;
        if (language === 'en') return product;

        // Check if Groq AI translation is available in map
        const langMap = aiTranslationsMap[language];
        if (langMap && langMap[product.id]) {
            const aiTrans = langMap[product.id];
            return {
                ...product,
                name: aiTrans.name || product.name,
                description: aiTrans.description || product.description,
                category: aiTrans.category || product.category
            };
        }

        // Fallback to offline dictionary helper while loading
        return translateProductHelper(product, language);
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t, translateProduct, isTranslating }}>
            {children}
        </LanguageContext.Provider>
    );
};
