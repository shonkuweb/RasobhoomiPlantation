import React from 'react';
import { useShop } from '../context/ShopContext';
import { Link } from 'react-router-dom';

const ProductCard = ({ product }) => {
    const { addToCart } = useShop();

    return (
        <div className="product-card">
            <Link to={`/product/${product.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="product-image-placeholder">
                    {product.image ? (
                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>IMG</div>
                    )}
                </div>
            </Link>

            <div className="product-info">
                <h3>{product.name}</h3>
                <div className="product-row">
                    <span className="product-price">{product.price}</span>
                    <button className="add-cart-pill" onClick={(e) => {
                        e.preventDefault();
                        addToCart(product.id);
                    }}>
                        Add
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
