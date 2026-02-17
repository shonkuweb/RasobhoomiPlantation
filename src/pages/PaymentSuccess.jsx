import React, { useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import '../styles/PaymentStatus.css';

const PaymentSuccess = () => {
    const [searchParams] = useSearchParams();
    const orderId = searchParams.get('orderId');
    const { clearCart } = useShop();

    useEffect(() => {
        clearCart();
    }, [clearCart]);

    return (
        <div className="payment-status-container">
            <div className="status-card">
                <div className="status-icon-wrapper icon-success">
                    ✓
                </div>
                <h1 className="status-title">Payment Successful!</h1>
                <p className="status-message">
                    Thank you for your purchase. Your order has been confirmed and will be shipped soon.
                </p>

                {orderId && (
                    <div className="order-details">
                        <strong>Order ID</strong>
                        <span className="order-id-text">#{orderId}</span>
                    </div>
                )}

                <div className="action-buttons">
                    <Link to="/" className="btn-primary">
                        Continue Shopping
                    </Link>
                    <Link to="/track-order" className="btn-outline">
                        Track Order
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;
