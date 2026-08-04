import React from 'react';
import { Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';

const CartSidebar = ({ isOpen, onClose }) => {
    const { cart, products, updateQty, getCartTotal } = useShop();
    const { t, translateProduct } = useLanguage();

    return (
        <div className={`cart-sidebar ${isOpen ? 'active' : ''}`} id="cart-sidebar">
            <div className="cart-header">
                <button className="cart-close-btn" onClick={onClose}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                {t('your_cart')}
            </div>

            <div className="cart-items">
                {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '2rem' }}>{t('cart_empty')}</div>
                ) : (
                    cart.map(item => {
                        const rawProduct = products.find(p => p.id === item.id) || item;
                        const product = translateProduct(rawProduct);
                        return (
                            <div className="cart-item" key={item.id}>
                                <div className="cart-item-img">
                                    {product.image ? (
                                        <img src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }} />
                                    ) : (
                                        <div style={{ width: '100%', height: '100%', background: '#eee', borderRadius: '12px' }} />
                                    )}
                                </div>
                                <div className="cart-item-details">
                                    <div className="cart-item-title">{product.name}</div>
                                    <div className="cart-item-text">
                                        {t('price')}: ₹{product.price}<br />
                                        {t('total')}: ₹{product.price * item.qty}
                                    </div>
                                </div>
                                <div className="qty-selector">
                                    <button className="qty-btn" onClick={() => updateQty(item.id, item.qty - 1)}>-</button>
                                    <span>{item.qty}</span>
                                    <button className="qty-btn" onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid #eee' }}>
                <Link to="/checkout" className="btn-add-product-modern" style={{ display: 'flex', justifyContent: 'center', textDecoration: 'none' }} onClick={onClose}>
                    {t('checkout')} - ₹{getCartTotal()}
                </Link>
            </div>
        </div>
    );
};

export default CartSidebar;
