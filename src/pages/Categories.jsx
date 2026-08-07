import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { resolveCategoryImageUrl, sortCategoriesWithMangoFirst } from '../utils/categories';
import { useLanguage } from '../context/LanguageContext';
import { translateCategoryName } from '../utils/translations';

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const { language, t } = useLanguage();

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error('Failed to fetch categories', err));
    }, []);

    return (
        <main style={{ padding: '1rem' }}>
            <h1 className="text-red" style={{ textAlign: 'center', marginBottom: '2rem', textTransform: 'uppercase' }}>
                {t('nav_categories')}
            </h1>

            <div
                className="category-grid-page"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '1.5rem',
                    justifyContent: 'center',
                }}
            >
                {sortCategoriesWithMangoFirst(categories).map(cat => {
                    const imgSrc = resolveCategoryImageUrl(cat);
                    const displayName = translateCategoryName(cat.name, language);
                    return (
                        <Link
                            to={`/category/${cat.slug}`}
                            key={cat.id}
                            className="cat-page-card"
                            style={{
                                textDecoration: 'none',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.6rem',
                            }}
                        >
                            <div
                                className="cat-page-circle"
                                style={{
                                    overflow: 'hidden',
                                    border: '3px solid #1A4D2E',
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    background: '#f5f5f5',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.08)'
                                }}
                            >
                                {imgSrc ? (
                                    <img
                                        src={imgSrc}
                                        alt={displayName}
                                        width={120}
                                        height={120}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        decoding="async"
                                    />
                                ) : (
                                    <span
                                        style={{
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            color: '#1A4D2E',
                                            textAlign: 'center',
                                            padding: '0.5rem',
                                        }}
                                    >
                                        {displayName}
                                    </span>
                                )}
                            </div>
                            <span style={{
                                fontWeight: '700',
                                fontSize: '0.9rem',
                                color: '#1A4D2E',
                                textAlign: 'center'
                            }}>
                                {displayName}
                            </span>
                        </Link>
                    );
                })}
            </div>

            {/* Product Catalog PDF Download Section */}
            <div style={{
                marginTop: '3rem',
                marginBottom: '1.5rem',
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                borderRadius: '16px',
                border: '1px solid #bbf7d0',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem'
            }}>
                <h2 style={{ fontSize: '1.2rem', color: '#166534', margin: 0, fontWeight: '800' }}>
                    📄 {language === 'bn' ? 'প্রোডাক্ট ক্যাটালগ ও মূল্য তালিকা (PDF)' : 'Product Price List Catalog (PDF)'}
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', maxWidth: '600px' }}>
                    {language === 'bn' ? 'বাংলা বা ইংরেজিতে আমাদের সমস্ত গাছের অফিশিয়াল রেট চার্ট ডাউনলোড করুন।' : 'Download our official price list & catalog with updated plant varieties in Bengali or English.'}
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.25rem' }}>
                    <a
                        href="/api/products/catalog-pdf?lang=bn"
                        target="_blank"
                        rel="noopener noreferrer"
                        download="Rasobhoomi_Products_Bengali.pdf"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.65rem 1.25rem',
                            background: '#166534',
                            color: '#ffffff',
                            borderRadius: '8px',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            textDecoration: 'none',
                            boxShadow: '0 2px 5px rgba(22, 101, 52, 0.2)'
                        }}
                    >
                        🇧🇩 {language === 'bn' ? 'বাংলা মূল্য তালিকা (PDF)' : 'Bengali Price List (PDF)'}
                    </a>
                    <a
                        href="/api/products/catalog-pdf?lang=en"
                        target="_blank"
                        rel="noopener noreferrer"
                        download="Rasobhoomi_Products_English.pdf"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.65rem 1.25rem',
                            background: '#0f172a',
                            color: '#ffffff',
                            borderRadius: '8px',
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            textDecoration: 'none'
                        }}
                    >
                        🇬🇧 {language === 'bn' ? 'ইংরেজি মূল্য তালিকা (PDF)' : 'English Price List (PDF)'}
                    </a>
                </div>
            </div>
        </main>
    );
};

export default Categories;
