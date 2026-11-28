import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import SEO from '../components/SEO';
import YouMayAlsoLike from '../components/YouMayAlsoLike';

const ProductDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { products, addToCart } = useShop();
    const { t, translateProduct } = useLanguage();
    const [rawProduct, setRawProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCurrentMediaIndex(0);

        const fromContext = products.find(p => p.id === id);

        const loadFullProduct = async () => {
            try {
                const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
                if (!res.ok) {
                    if (!cancelled) setRawProduct(null);
                    return;
                }
                const full = await res.json();
                if (!cancelled) setRawProduct(full);
            } catch (err) {
                console.error('Failed to load product', err);
                if (!cancelled) setRawProduct(null);
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
    const videos = Array.isArray(product.videos) ? product.videos.filter(Boolean) : [];
    const mediaItems = [
        ...images.map((src) => ({ type: 'image', src })),
        ...videos.map((src) => ({ type: 'video', src })),
    ];
    const safeIndex = currentMediaIndex < mediaItems.length ? currentMediaIndex : 0;
    const activeMedia = mediaItems[safeIndex] || null;

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
        <main style={{ padding: '1rem', paddingBottom: '7rem' }}>
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
                    {activeMedia ? (
                        activeMedia.type === 'video' ? (
                            <video
                                key={activeMedia.src}
                                src={activeMedia.src}
                                poster={images[0] || undefined}
                                controls
                                playsInline
                                loop
                                preload="metadata"
                                width={600}
                                height={600}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    aspectRatio: '1 / 1',
                                    objectFit: 'cover',
                                    display: 'block',
                                    backgroundColor: '#000',
                                }}
                            />
                        ) : (
                            <img
                                src={activeMedia.src}
                                alt={product.name}
                                width={600}
                                height={600}
                                fetchPriority={safeIndex === 0 ? 'high' : undefined}
                                loading="eager"
                                decoding="async"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    aspectRatio: '1 / 1',
                                    objectFit: 'cover',
                                    display: 'block',
                                }}
                            />
                        )
                    ) : (
                        <div style={{ padding: '2rem' }}>NO IMAGE</div>
                    )}
                </div>

                {mediaItems.length > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        {mediaItems.map((item, idx) => {
                            const isActive = idx === safeIndex;
                            return (
                                <button
                                    key={`${item.type}-${idx}`}
                                    type="button"
                                    onClick={() => setCurrentMediaIndex(idx)}
                                    aria-label={item.type === 'video' ? `View product video ${idx - images.length + 1}` : `View product photo ${idx + 1}`}
                                    aria-current={isActive ? 'true' : undefined}
                                    style={{
                                        width: '54px',
                                        height: '54px',
                                        aspectRatio: '1 / 1',
                                        padding: 0,
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        background: '#111827',
                                        border: isActive ? '2.5px solid #2C1B10' : '1.5px solid #d1d5db',
                                        boxShadow: isActive ? '0 0 0 2px rgba(44, 27, 16, 0.2)' : 'none',
                                    }}
                                >
                                    {item.type === 'video' ? (
                                        <>
                                            <video
                                                src={item.src}
                                                muted
                                                playsInline
                                                preload="metadata"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                                            />
                                            <span
                                                aria-hidden="true"
                                                style={{
                                                    position: 'absolute',
                                                    inset: 0,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    background: 'rgba(0, 0, 0, 0.35)',
                                                    color: 'white',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 'bold',
                                                }}
                                            >
                                                ▶
                                            </span>
                                        </>
                                    ) : (
                                        <img
                                            src={item.src}
                                            alt=""
                                            loading="lazy"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                        />
                                    )}
                                </button>
                            );
                        })}
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

                {/* You May Also Like Section */}
                <YouMayAlsoLike currentProduct={rawProduct} />

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
