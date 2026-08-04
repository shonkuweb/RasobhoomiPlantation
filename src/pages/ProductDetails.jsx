import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import SEO from '../components/SEO';

const ProductDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { products, addToCart } = useShop();
    const { t, translateProduct } = useLanguage();
    const [rawProduct, setRawProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCurrentImageIndex(0);

        const fromContext = products.find(p => p.id === id);

        const loadFullProduct = async () => {
            try {
                const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
                if (!res.ok) {
                    if (!cancelled && !fromContext) setRawProduct(null);
                    return;
                }
                const full = await res.json();
                if (!cancelled) setRawProduct(full);
            } catch (err) {
                console.error('Failed to load product', err);
                if (!cancelled && !fromContext) setRawProduct(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        if (fromContext) {
            setRawProduct(fromContext);
        }

        loadFullProduct();

        return () => {
            cancelled = true;
        };
    }, [id, products]);

    if (loading && !rawProduct) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Loading...</p>
            </div>
        );
    }

    if (!rawProduct) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Product not found.</p>
            </div>
        );
    }

    const product = translateProduct(rawProduct);

    const images = product.images && product.images.length > 0
        ? product.images
        : (product.image ? [product.image] : []);

    const handleAddToCart = () => {
        addToCart(product.id);
        alert('Added to cart!');
    };

    const handleBuyNow = () => {
        addToCart(product.id);
        navigate('/checkout');
    };

    const hasDiscount = product.compare_price > product.price;
    const discountPercent = hasDiscount ? Math.round(((product.compare_price - product.price) / product.compare_price) * 100) : 0;

    return (
        <main style={{ padding: '1rem', paddingBottom: '5rem' }}>
            <SEO
                title={product.name}
                description={product.description && product.description.substring(0, 160)}
                image={images[0]}
                type="product"
                structuredData={{
                    "@context": "https://schema.org/",
                    "@type": "Product",
                    "name": product.name,
                    "image": images,
                    "description": product.description,
                    "offers": {
                        "@type": "Offer",
                        "url": window.location.href,
                        "priceCurrency": "INR",
                        "price": product.price,
                        "availability": product.qty > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
                    }
                }}
            />
            <div className="product-detail-container">
                <div className="detail-image-container" style={{ position: 'relative' }}>
                    {hasDiscount && (
                        <div style={{
                            position: 'absolute', top: '15px', left: '15px', background: '#e11d48',
                            color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold', zIndex: 10,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                        }}>
                            {discountPercent}% {t('off')}
                        </div>
                    )}
                    {images.length > 0 ? (
                        <img
                            src={images[currentImageIndex]}
                            alt={product.name}
                            loading="eager"
                            decoding="async"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{ padding: '2rem' }}>NO IMAGE</div>
                    )}
                </div>

                {images.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        {images.map((_, idx) => (
                            <div
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: idx === currentImageIndex ? '#2C1B10' : '#ccc',
                                    cursor: 'pointer'
                                }}
                            ></div>
                        ))}
                    </div>
                )}

                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{product.name}</h1>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            {hasDiscount && <span style={{ textDecoration: 'line-through', color: '#888', fontSize: '1rem', lineHeight: '1' }}>₹{product.compare_price}</span>}
                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', lineHeight: '1', marginTop: hasDiscount ? '4px' : '0' }}>₹{product.price}</div>
                        </div>
                    </div>

                    <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: '1.6' }}>
                        {product.description || 'No description available.'}
                    </p>
                </div>

                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: '#666' }}>{t('category')}</span>
                        <span style={{ fontWeight: 'bold' }}>{product.category || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666' }}>Availability</span>
                        <span style={{ fontWeight: 'bold', color: product.qty > 0 ? 'green' : 'red' }}>
                            {product.qty > 0 ? 'In Stock' : t('out_of_stock')}
                        </span>
                    </div>
                </div>

                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    background: 'white',
                    padding: '1rem',
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                    display: 'flex',
                    gap: '1rem',
                    zIndex: 100
                }}>
                    {product.qty <= 0 ? (
                        <button style={{ flex: 1, padding: '1rem', background: '#ccc', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'not-allowed' }} disabled>
                            {t('out_of_stock')}
                        </button>
                    ) : (
                        <>
                            <button onClick={handleAddToCart} style={{
                                flex: 1,
                                padding: '1rem',
                                background: '#f3f4f6',
                                border: 'none',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                                {t('add_to_cart')}
                            </button>
                            <button onClick={handleBuyNow} style={{
                                flex: 1,
                                padding: '1rem',
                                background: '#2C1B10',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                            }}>
                                {t('buy_now')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
};

export default ProductDetails;
