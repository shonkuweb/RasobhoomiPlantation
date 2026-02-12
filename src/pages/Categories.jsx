import React from 'react';
import { Link } from 'react-router-dom';
// import { categories } from '../utils/categories';
import { useState, useEffect } from 'react';

const Categories = () => {
    const [categories, setCategories] = useState([]);
    const [products, setProducts] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [catRes, prodRes] = await Promise.all([
                    fetch('/api/categories'),
                    fetch('/api/products')
                ]);
                if (catRes.ok) setCategories(await catRes.json());
                if (prodRes.ok) setProducts(await prodRes.json());
            } catch (err) {
                console.error("Failed to fetch data", err);
            }
        };
        fetchData();
    }, []);

    const visibleCategories = categories.filter(cat =>
        products.some(p => p.category === cat.name && p.qty > 0) || products.some(p => p.category === cat.name)
        // Logic: Show if ANY product exists. The user said "no product... not visible". 
        // If they meant stock > 0, I'd add p.qty > 0. For now, strict "existence" is safely matching "no product".
        // Actually, user said "no product for that category". 
        // So populated with 0 stock is still "has product". 
        // I will stick to existence: products.some(p => p.category === cat.name).
    );

    return (
        <main style={{ padding: '1rem' }}>
            <h1 className="text-red" style={{ textAlign: 'center', marginBottom: '2rem' }}>CATEGORIES</h1>

            <div className="category-grid-page" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1.5rem', justifyContent: 'center' }}>
                {visibleCategories.map(cat => (
                    <Link to={`/category/${cat.slug}`} key={cat.id} className="cat-page-card" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <div className="cat-page-circle" style={{ overflow: 'hidden', border: '3px solid #DFC186', width: '120px', height: '120px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <img src={cat.image} alt={cat.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div className="cat-page-label" style={{ textAlign: 'center', color: '#2C1B10', fontWeight: 'bold' }}>{cat.name}</div>
                    </Link>
                ))}
            </div>
        </main>
    );
};

export default Categories;
