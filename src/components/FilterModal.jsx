import React, { useState } from 'react';
import { categories as allCategories, sortCategoriesWithMangoFirst } from '../utils/categories';
import { useLanguage } from '../context/LanguageContext';
import { translateCategoryName } from '../utils/translations';

const FilterModal = ({ isOpen, onClose, onApply }) => {
    const { language, t } = useLanguage();
    const [sort, setSort] = useState('default');
    const [selectedCategoryNames, setSelectedCategoryNames] = useState([]);
    const [stock, setStock] = useState(false);

    if (!isOpen) return null;

    const handleCategoryChange = (cat) => {
        setSelectedCategoryNames(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const handleApply = () => {
        onApply({ sort, categories: selectedCategoryNames, stock });
        onClose();
    };

    const handleReset = () => {
        setSort('default');
        setSelectedCategoryNames([]);
        setStock(false);
    };

    const categoryOptions = sortCategoriesWithMangoFirst(allCategories).map(cat => cat.name);

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
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{t('filter_sorting')}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
                </div>

                {/* Sort */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{t('sort_by_price')}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="default" checked={sort === 'default'} onChange={() => setSort('default')} />
                            {t('default_sort')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="lowHigh" checked={sort === 'lowHigh'} onChange={() => setSort('lowHigh')} />
                            {t('price_low_high')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input type="radio" name="sortPrice" value="highLow" checked={sort === 'highLow'} onChange={() => setSort('highLow')} />
                            {t('price_high_low')}
                        </label>
                    </div>
                </div>

                {/* Categories */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{t('nav_categories')}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {categoryOptions.map(cat => (
                            <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                    type="checkbox"
                                    checked={selectedCategoryNames.includes(cat)}
                                    onChange={() => handleCategoryChange(cat)}
                                />
                                {translateCategoryName(cat, language)}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Stock */}
                <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{t('availability')}</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" checked={stock} onChange={e => setStock(e.target.checked)} />
                        {t('in_stock_only')}
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
                        {t('reset')}
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
                        {t('apply')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FilterModal;
