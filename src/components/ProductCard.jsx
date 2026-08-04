import React from 'react';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import { Link } from 'react-router-dom';

const ProductCard = ({ product: rawProduct }) => {
    const { addToCart } = useShop();
    const { t, translateProduct } = useLanguage();

    const product = translateProduct(rawProduct);
    const hasDiscount = product.compare_price > product.price;
    const discountPercent = hasDiscount ? Math.round(((product.compare_price - product.price) / product.compare_price) * 100) : 0;

    return (
        <div className="product-card">
            <Link to={`/product/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
                {hasDiscount && (
                    <div style={{
                        position: 'absolute', top: '10px', left: '10px', background: '#e11d48',
                        color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', zIndex: 10,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                    }}>
                        {discountPercent}% {t('off')}
                    </div>
                )}
                <div className="product-image-placeholder">
                    {product.image ? (
                        <img
                            src={product.image}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>IMG</div>
                    )}
                </div>
            </Link>

            <div className="product-info">
                <h3>{product.name}</h3>
                <div className="product-row" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        {hasDiscount && (
                            <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '0.75rem', lineHeight: '1' }}>
                                ₹{product.compare_price}
                            </span>
                        )}
                        <span className="product-price" style={{ lineHeight: '1', marginTop: hasDiscount ? '2px' : '0' }}>₹{product.price}</span>
                    </div>
                    <button className="add-cart-pill" onClick={(e) => {
                        e.preventDefault();
                        addToCart(product.id);
                    }}>
                        {t('add')}
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
