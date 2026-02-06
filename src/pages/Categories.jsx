import React from 'react';
import { Link } from 'react-router-dom';
// import { categories } from '../utils/categories';
import { useState, useEffect } from 'react';

const Categories = () => {
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error("Failed to fetch categories", err));
    }, []);

    return (
        <main style={{ padding: '1rem' }}>
            <h1 className="text-red" style={{ textAlign: 'center', marginBottom: '2rem' }}>CATEGORIES</h1>

            <div className="category-grid-page" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1.5rem', justifyContent: 'center' }}>
                {categories.map(cat => (
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
