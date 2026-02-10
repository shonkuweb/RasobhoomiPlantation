import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import SEO from '../components/SEO';

const ProductDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { products, addToCart } = useShop();
    const [product, setProduct] = useState(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        if (products.length > 0) {
            const found = products.find(p => p.id === id);
            setProduct(found);
        }
    }, [products, id]);

    if (!product) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p>Loading product details...</p>
                {products.length > 0 && <p>Product not found.</p>}
            </div>
        );
    }

    // Prepare images array
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
                {/* Image Gallery */}
                <div className="detail-image-container">
                    {images.length > 0 ? (
                        <img
                            src={images[currentImageIndex]}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{ padding: '2rem' }}>NO IMAGE</div>
                    )}
                </div>

                {/* Dots */}
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

                {/* Info */}
                <div style={{ marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{product.name}</h1>
                        <div style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>₹{product.price}</div>
                    </div>

                    <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: '1.6' }}>
                        {product.description || 'No description available.'}
                    </p>
                </div>

                {/* Additional Info (Static for now as per HTML) */}
                <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: '#666' }}>Category</span>
                        <span style={{ fontWeight: 'bold' }}>{product.category || 'N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#666' }}>Availability</span>
                        <span style={{ fontWeight: 'bold', color: product.qty > 0 ? 'green' : 'red' }}>
                            {product.qty > 0 ? 'In Stock' : 'Out of Stock'}
                        </span>
                    </div>
                </div>

                {/* Sticky Action Bar */}
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
                            OUT OF STOCK
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
                                Add to Cart
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
                                Buy Now
                            </button>
                        </>
                    )}
                </div>
            </div>
        </main>
    );
};

export default ProductDetails;
