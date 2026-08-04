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
        </main>
    );
};

export default Categories;
