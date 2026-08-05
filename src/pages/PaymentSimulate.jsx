import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

const PaymentSimulate = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderId = searchParams.get('orderId') || 'ORD-TEST';
    const total = searchParams.get('total') || '0';
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState('phonepe_upi');

    const handleAction = (status) => {
        setIsProcessing(true);
        setTimeout(() => {
            if (status === 'success') {
                window.location.href = `/api/phonepe/callback?merchantOrderId=${encodeURIComponent(orderId)}&code=PAYMENT_SUCCESS`;
            } else if (status === 'failure') {
                window.location.href = `/api/phonepe/callback?merchantOrderId=${encodeURIComponent(orderId)}&code=PAYMENT_ERROR`;
            } else {
                navigate(`/payment/pending?orderId=${encodeURIComponent(orderId)}`);
            }
        }, 1200);
    };

    return (
        <div style={{
            minHeight: '85vh',
            background: 'linear-gradient(135deg, #f5f0eb 0%, #e8dcd0 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem'
        }}>
            <div style={{
                background: '#ffffff',
                borderRadius: '20px',
                boxShadow: '0 20px 40px rgba(95, 37, 159, 0.15)',
                width: '100%',
                maxWidth: '480px',
                overflow: 'hidden',
                border: '1px solid rgba(95, 37, 159, 0.2)'
            }}>
                {/* PhonePe Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #5f259f 0%, #3e1270 100%)',
                    color: '#ffffff',
                    padding: '1.5rem',
                    textAlign: 'center',
                    position: 'relative'
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'rgba(255,255,255,0.15)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        marginBottom: '10px'
                    }}>
                        <span>🧪 Sandbox Simulation Mode</span>
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.5px' }}>
                        PhonePe Payment Gateway
                    </h2>
                    <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>
                        Rasobhoomi Plantation Test Checkout
                    </p>
                </div>

                {/* Body */}
                <div style={{ padding: '1.8rem' }}>
                    {/* Order Details Box */}
                    <div style={{
                        background: '#f8f9fa',
                        borderRadius: '14px',
                        padding: '1.2rem',
                        border: '1px solid #e9ecef',
                        marginBottom: '1.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#6c757d' }}>
                            <span>Order ID</span>
                            <strong style={{ color: '#212529', fontFamily: 'monospace' }}>#{orderId}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem', color: '#6c757d' }}>
                            <span>Merchant</span>
                            <strong style={{ color: '#212529' }}>Rasobhoomi Plantation</strong>
                        </div>
                        <div style={{ height: '1px', background: '#dee2e6', margin: '10px 0' }}></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: '600', color: '#212529' }}>Total Amount</span>
                            <span style={{ fontSize: '1.6rem', fontWeight: '800', color: '#5f259f' }}>₹{total}</span>
                        </div>
                    </div>

                    {/* Payment Method Selector */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', textTransform: 'uppercase', color: '#6c757d', marginBottom: '8px' }}>
                            Select Simulated Payment Method
                        </label>
                        <div
                            onClick={() => setSelectedMethod('phonepe_upi')}
                            style={{
                                border: selectedMethod === 'phonepe_upi' ? '2px solid #5f259f' : '1px solid #dee2e6',
                                background: selectedMethod === 'phonepe_upi' ? '#f4edfc' : '#ffffff',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ fontSize: '1.4rem' }}>📱</span>
                            <div>
                                <strong style={{ display: 'block', fontSize: '0.95rem', color: '#212529' }}>PhonePe UPI / QR Test</strong>
                                <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>Simulate instant UPI payment authorization</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    {isProcessing ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                            <div className="spinner-border" style={{
                                width: '40px',
                                height: '40px',
                                border: '4px solid #f3f3f3',
                                borderTop: '4px solid #5f259f',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto 12px'
                            }}></div>
                            <p style={{ margin: 0, fontWeight: '600', color: '#5f259f' }}>
                                Communicating with PhonePe Sandbox...
                            </p>
                            <style>{`
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            `}</style>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button
                                onClick={() => handleAction('success')}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: '#5f259f',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontSize: '1rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(95, 37, 159, 0.3)',
                                    transition: 'transform 0.1s, background 0.2s'
                                }}
                                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                                onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                🟢 Complete Payment (Simulate Success)
                            </button>

                            <button
                                onClick={() => handleAction('failure')}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    background: '#ffffff',
                                    color: '#dc3545',
                                    border: '1.5px solid #dc3545',
                                    borderRadius: '12px',
                                    fontSize: '0.95rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s'
                                }}
                            >
                                🔴 Cancel / Decline (Simulate Failure)
                            </button>

                            <button
                                onClick={() => handleAction('pending')}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: 'none',
                                    color: '#6c757d',
                                    border: 'none',
                                    fontSize: '0.85rem',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    textDecoration: 'underline'
                                }}
                            >
                                ⏳ Simulate Pending Status
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaymentSimulate;
