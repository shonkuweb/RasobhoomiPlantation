import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
// import { categories } from '../utils/categories';
import ProductCard from '../components/ProductCard';
import SEO from '../components/SEO';

const CategoryPage = () => {
    const { slug } = useParams();
    const { products } = useShop();
    const [categoryProducts, setCategoryProducts] = useState([]);
    const [title, setTitle] = useState('');
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (categories.length === 0) return;
        const category = categories.find(c => c.slug === slug);
        const categoryName = category ? category.name : 'Unknown Category';
        setTitle(categoryName);

        if (products.length > 0) {
            const filtered = products.filter(p => p.category === categoryName);
            setCategoryProducts(filtered);
        }
    }, [slug, products, categories]);

    return (
        <main style={{ padding: '1rem', maxWidth: '1440px', margin: '0 auto' }}>
            <SEO
                title={`${title} - Maa Handloom`}
                description={`Explore our collection of ${title} at Maa Handloom.`}
                keywords={`${title}, handloom sarees, buy ${title} online`}
            />
            <div style={{ padding: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Link to="/" style={{ textDecoration: 'none', color: '#2C1B10', fontWeight: 'bold' }}>← Back to Home</Link>
                <h1 style={{ fontSize: '1.5rem', textTransform: 'uppercase' }}>{title}</h1>
            </div>

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
        </main>
    );
};

export default CategoryPage;
