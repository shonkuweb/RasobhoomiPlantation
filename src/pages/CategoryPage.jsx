import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import { translateCategoryName } from '../utils/translations';
import ProductCard from '../components/ProductCard';
import SEO from '../components/SEO';

const CategoryPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { products } = useShop();
    const { language, t } = useLanguage();
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [rawTitle, setRawTitle] = useState('');
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        if (slug === 'currant') {
            navigate('/category/anar', { replace: true });
        }
    }, [slug, navigate]);

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (categories.length === 0) return;
        const category = categories.find(c => c.slug === slug);
        if (!category) {
            setRawTitle('');
            setCategoryProducts([]);
            return;
        }
        const categoryName = category.name;
        setRawTitle(categoryName);

        if (products.length > 0) {
            const filtered = products.filter(p => p.category === categoryName);
            setCategoryProducts(filtered);
        }
    }, [slug, products, categories]);

    const isNotFound = categories.length > 0 && !categories.some(c => c.slug === slug);
    const displayTitle = rawTitle ? translateCategoryName(rawTitle, language) : (isNotFound ? 'Category Not Available' : 'Category');

    return (
        <main style={{ padding: '1rem', maxWidth: '1440px', margin: '0 auto' }}>
            <SEO
                title={`${displayTitle} Collection`}
                description={`Browse our exclusive collection of ${displayTitle} at Rasobhoomi Plantation.`}
            />
            <div style={{ padding: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link to="/" style={{ textDecoration: 'none', color: '#2C1B10', fontWeight: 'bold' }}>
                    ← {t('nav_home')}
                </Link>
                <h1 style={{ fontSize: '1.5rem', textTransform: 'uppercase' }}>{displayTitle}</h1>
            </div>

            {isNotFound ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                    <p style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                        This category is currently not available or has been hidden.
                    </p>
                    <Link to="/categories" style={{
                        display: 'inline-block',
                        padding: '0.65rem 1.5rem',
                        background: '#1A4D2E',
                        color: 'white',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 'bold',
                        fontSize: '0.9rem'
                    }}>
                        {t('view_all_categories') || 'View All Categories'}
                    </Link>
                </div>
            ) : (
                <section className="product-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '1.5rem'
                }}>
                    {categoryProducts.length > 0 ? (
                        categoryProducts.map(p => <ProductCard key={p.id} product={p} />)
                    ) : (
                        <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '2rem' }}>
                            No products found in this category.
                        </p>
                    )}
                </section>
            )}
        </main>
    );
};

export default CategoryPage;
