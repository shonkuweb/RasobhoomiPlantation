import React, { useState } from 'react';
import { categories } from '../utils/categories';

const FilterModal = ({ isOpen, onClose, onApply }) => {
    const [sort, setSort] = useState('default');
    const [categories, setCategories] = useState([]);
    const [stock, setStock] = useState(false);

    if (!isOpen) return null;

    const handleCategoryChange = (cat) => {
        setCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleApply = () => {
        onApply({ sort, categories, stock });
        onClose();
    };

    const handleReset = () => {
        setSort('default');
        setCategories([]);
        setStock(false);
    };

    const categoryOptions = categories.map(cat => cat.name);


    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                padding: '2rem',
                borderRadius: '8px',
                width: '90%',
                maxWidth: '400px',
                maxHeight: '90vh',
                overflowY: 'auto'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>FILTER & SORT</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                </div>

                {/* Sort */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Sort By Price</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="default" checked={sort === 'default'} onChange={() => setSort('default')} />
                            Default
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="lowHigh" checked={sort === 'lowHigh'} onChange={() => setSort('lowHigh')} />
                            Price: Low to High
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="highLow" checked={sort === 'highLow'} onChange={() => setSort('highLow')} />
                            Price: High to Low
                        </label>
                    </div>
                </div>

                {/* Categories */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Categories</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {categoryOptions.map(cat => (
                            <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    checked={categories.includes(cat)}
                                    onChange={() => handleCategoryChange(cat)}
                                />
                                {cat}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Stock */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Availability</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" checked={stock} onChange={e => setStock(e.target.checked)} />
                        In Stock Only
                    </label>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={handleReset}
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            border: '1px solid #ccc',
                            background: 'white',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        RESET
                    </button>
                    <button
                        onClick={handleApply}
                        style={{
                            flex: 1,
                            padding: '0.75rem',
                            background: '#2C1B10',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        APPLY
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FilterModal;
