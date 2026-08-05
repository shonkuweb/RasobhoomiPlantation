import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import { translateCategoryName } from '../utils/translations';

const YouMayAlsoLike = ({ currentProduct }) => {
    const navigate = useNavigate();
    const { products, addToCart } = useShop();
    const { t, translateProduct, language } = useLanguage();

    const recommendations = useMemo(() => {
        if (!currentProduct || !products || products.length === 0) return [];

        const currentId = currentProduct.id;
        const currentCategory = currentProduct.category;

        // 1. Same category products (excluding current)
        const sameCategory = products.filter(
            p => p.id !== currentId && p.category && p.category === currentCategory
        );

        // 2. Other products fallback
        const otherProducts = products.filter(
            p => p.id !== currentId && (!currentCategory || p.category !== currentCategory)
        );

        // Combine same category first, then fallback to others
        const combined = [...sameCategory, ...otherProducts];

        // Pick top 4 recommended items
        return combined.slice(0, 4);
    }, [currentProduct, products]);

    if (!recommendations || recommendations.length === 0) return null;

    const handleViewProduct = (productId) => {
        navigate(`/product/${productId}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <section className="you-may-also-like-section" style={{ marginTop: '3.5rem', marginBottom: '2rem' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                marginBottom: '1.5rem',
                borderBottom: '2px solid #f0f0f0',
                paddingBottom: '0.75rem'
            }}>
                <div>
                    <h2 style={{
                        fontSize: '1.4rem',
                        fontWeight: '800',
                        color: '#2C1B10',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: '4px',
                            height: '20px',
                            backgroundColor: '#2e7d32',
                            borderRadius: '2px'
                        }}></span>
                        {t('you_may_also_like') || 'You May Also Like'}
                    </h2>
                    <p style={{
                        margin: '4px 0 0 0',
                        fontSize: '0.85rem',
                        color: '#666',
                        fontWeight: '400'
                    }}>
                        {t('featured_products_recommend') || 'Featured plants & saplings selected for you'}
                    </p>
                </div>
            </div>

            <div className="recommendations-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '1.25rem'
            }}>
                {recommendations.map(rawItem => {
                    const item = translateProduct(rawItem);
                    const hasDiscount = item.compare_price > item.price;
                    const discountPercent = hasDiscount
                        ? Math.round(((item.compare_price - item.price) / item.compare_price) * 100)
                        : 0;

                    const imageSrc = item.image || (item.images && item.images[0]) || null;
                    const catName = translateCategoryName(item.category, language);

                    return (
                        <div
                            key={item.id}
                            className="recommended-card"
                            style={{
                                background: '#ffffff',
                                borderRadius: '12px',
                                border: '1px solid #eaeaea',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                position: 'relative'
                            }}
                        >
                            {/* Image & Badges */}
                            <div
                                onClick={() => handleViewProduct(item.id)}
                                style={{
                                    height: '180px',
                                    background: '#f8f9fa',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justify: 'center'
                                }}
                            >
                                {hasDiscount && (
                                    <span style={{
                                        position: 'absolute',
                                        top: '10px',
                                        left: '10px',
                                        background: '#e11d48',
                                        color: '#ffffff',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        zIndex: 2,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                                    }}>
                                        {discountPercent}% {t('off')}
                                    </span>
                                )}

                                {imageSrc ? (
                                    <img
                                        src={imageSrc}
                                        alt={item.name}
                                        loading="lazy"
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            transition: 'transform 0.4s ease'
                                        }}
                                        className="recommended-img"
                                    />
                                ) : (
                                    <div style={{ color: '#aaa', fontSize: '0.85rem' }}>No Image</div>
                                )}
                            </div>

                            {/* Product Info */}
                            <div style={{
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    {catName && (
                                        <span style={{
                                            fontSize: '0.725rem',
                                            fontWeight: '600',
                                            color: '#2e7d32',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            display: 'block',
                                            marginBottom: '4px'
                                        }}>
                                            {catName}
                                        </span>
                                    )}
                                    <h3
                                        onClick={() => handleViewProduct(item.id)}
                                        style={{
                                            fontSize: '0.95rem',
                                            fontWeight: '700',
                                            color: '#1a1a1a',
                                            margin: '0 0 8px 0',
                                            lineHeight: '1.3',
                                            cursor: 'pointer',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            minHeight: '2.6em'
                                        }}
                                        title={item.name}
                                    >
                                        {item.name}
                                    </h3>
                                </div>

                                <div>
                                    {/* Price section */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        gap: '6px',
                                        marginBottom: '1rem'
                                    }}>
                                        <span style={{
                                            fontSize: '1.15rem',
                                            fontWeight: '800',
                                            color: '#2C1B10'
                                        }}>
                                            ₹{item.price}
                                        </span>
                                        {hasDiscount && (
                                            <span style={{
                                                fontSize: '0.825rem',
                                                color: '#888',
                                                textDecoration: 'line-through'
                                            }}>
                                                ₹{item.compare_price}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <button
                                            onClick={() => handleViewProduct(item.id)}
                                            style={{
                                                flex: 1,
                                                padding: '0.6rem 0.8rem',
                                                background: '#2C1B10',
                                                color: '#ffffff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                fontWeight: '600',
                                                fontSize: '0.825rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justify: 'center',
                                                gap: '0.4rem',
                                                transition: 'all 0.2s ease'
                                            }}
                                            className="view-btn-hover"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                            {t('view_product') || 'View Product'}
                                        </button>

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                addToCart(item.id);
                                            }}
                                            title={t('add_to_cart') || 'Add to Cart'}
                                            style={{
                                                padding: '0.6rem',
                                                background: '#e8f5e9',
                                                color: '#2e7d32',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justify: 'center',
                                                transition: 'all 0.2s ease'
                                            }}
                                            className="add-cart-icon-btn"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                                                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default YouMayAlsoLike;
