import React, { useState, useEffect } from 'react';
import axios from 'axios';

const WhatsAppQR = () => {
    const [statusData, setStatusData] = useState({
        status: 'INITIALIZING',
        qrCode: null,
        user: null,
        targetNumber: '+91 8972076182'
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [testLoading, setTestLoading] = useState(false);
    const [testResult, setTestResult] = useState('');
    const [logoutLoading, setLogoutLoading] = useState(false);

    const fetchStatus = async () => {
        try {
            const response = await axios.get('/api/whatsapp/status');
            setStatusData(response.data);
            setError('');
        } catch (err) {
            console.error('Error fetching WhatsApp status:', err);
            setError('Failed to connect to backend WhatsApp service.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 2500);
        return () => clearInterval(interval);
    }, []);

    const handleSendTest = async () => {
        setTestLoading(true);
        setTestResult('');
        try {
            const res = await axios.post('/api/whatsapp/test', { number: '8972076182' });
            if (res.data.success) {
                setTestResult('✅ Test message sent successfully to +91 8972076182!');
            } else {
                setTestResult(`❌ Failed to send test message: ${res.data.error || 'Unknown error'}`);
            }
        } catch (err) {
            setTestResult(`❌ Error sending test message: ${err.response?.data?.error || err.message}`);
        } finally {
            setTestLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!window.confirm('Are you sure you want to disconnect WhatsApp and regenerate a new QR code?')) {
            return;
        }
        setLogoutLoading(true);
        try {
            await axios.post('/api/whatsapp/logout');
            await fetchStatus();
        } catch (err) {
            alert('Failed to disconnect WhatsApp session.');
        } finally {
            setLogoutLoading(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <div style={styles.iconWrapper}>📱</div>
                    <div>
                        <h1 style={styles.title}>WhatsApp Order Notifications</h1>
                        <p style={styles.subtitle}>Rasobhoomi Plantation Automatic Order Dispatcher</p>
                    </div>
                </div>

                {error && <div style={styles.errorBanner}>{error}</div>}

                {/* STATUS BAR */}
                <div style={styles.statusSection}>
                    <span style={styles.statusLabel}>Connection Status:</span>
                    {statusData.status === 'CONNECTED' && (
                        <span style={{ ...styles.badge, ...styles.badgeConnected }}>
                            🟢 Connected & Active
                        </span>
                    )}
                    {statusData.status === 'QR_READY' && (
                        <span style={{ ...styles.badge, ...styles.badgeReady }}>
                            🟡 Ready for QR Scan
                        </span>
                    )}
                    {(statusData.status === 'INITIALIZING' || loading) && (
                        <span style={{ ...styles.badge, ...styles.badgeInitializing }}>
                            🔵 Initializing Client...
                        </span>
                    )}
                    {statusData.status === 'DISCONNECTED' && !loading && (
                        <span style={{ ...styles.badge, ...styles.badgeDisconnected }}>
                            🔴 Disconnected
                        </span>
                    )}
                </div>

                {/* TARGET NOTIFICATION NUMBER INFO */}
                <div style={styles.infoBox}>
                    <strong>Target Notification Number:</strong> {statusData.targetNumber || '+91 8972076182'}
                    <div style={styles.infoDesc}>
                        When a customer completes payment, full order details are instantly formatted and dispatched to this number.
                    </div>
                </div>

                {/* CONNECTED STATE */}
                {statusData.status === 'CONNECTED' && (
                    <div style={styles.connectedCard}>
                        <div style={styles.successIcon}>✅</div>
                        <h2 style={styles.connectedTitle}>WhatsApp Successfully Linked!</h2>
                        <p style={styles.connectedText}>
                            Logged in as: <strong>{statusData.user?.name || 'Rasobhoomi WhatsApp'}</strong> ({statusData.user?.number || 'Active'})
                        </p>
                        <p style={styles.connectedSubtext}>
                            Order notification alerts will be sent directly from this WhatsApp account to <strong>+91 8972076182</strong> upon every successful payment.
                        </p>

                        <div style={styles.actionButtons}>
                            <button
                                style={styles.testBtn}
                                onClick={handleSendTest}
                                disabled={testLoading}
                            >
                                {testLoading ? 'Sending Test...' : '🧪 Send Test WhatsApp Alert'}
                            </button>

                            <button
                                style={styles.logoutBtn}
                                onClick={handleLogout}
                                disabled={logoutLoading}
                            >
                                {logoutLoading ? 'Disconnecting...' : '🔒 Disconnect WhatsApp'}
                            </button>
                        </div>

                        {testResult && <div style={styles.testResultBox}>{testResult}</div>}
                    </div>
                )}

                {/* QR READY STATE */}
                {statusData.status === 'QR_READY' && statusData.qrCode && (
                    <div style={styles.qrSection}>
                        <h2 style={styles.qrTitle}>Scan QR Code to Connect</h2>
                        <p style={styles.qrSubtitle}>
                            Open WhatsApp on your phone and scan the QR code below:
                        </p>

                        <div style={styles.qrContainer}>
                            <img src={statusData.qrCode} alt="WhatsApp QR Code" style={styles.qrImage} />
                        </div>

                        <div style={styles.instructions}>
                            <div style={styles.step}>1. Open <strong>WhatsApp</strong> on your mobile device.</div>
                            <div style={styles.step}>2. Tap <strong>Menu</strong> (Android) or <strong>Settings</strong> (iPhone).</div>
                            <div style={styles.step}>3. Select <strong>Linked Devices</strong> and tap <strong>Link a Device</strong>.</div>
                            <div style={styles.step}>4. Point your camera at this QR code to scan.</div>
                        </div>
                    </div>
                )}

                {/* INITIALIZING / LOADING STATE */}
                {(statusData.status === 'INITIALIZING' || (statusData.status === 'DISCONNECTED' && loading)) && (
                    <div style={styles.loadingSection}>
                        <div style={styles.spinner}></div>
                        <p style={styles.loadingText}>Initializing WhatsApp Web engine... Please wait a moment.</p>
                    </div>
                )}

                <div style={styles.footerNote}>
                    🔒 Persistent Session: Session remains saved even after VPS restarts.
                </div>
            </div>
        </div>
    );
};

const styles = {
    container: {
        minHeight: '80vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
        backgroundColor: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        padding: '2.5rem',
        maxWidth: '580px',
        width: '100%',
        boxSizing: 'border-box'
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: '1rem'
    },
    iconWrapper: {
        fontSize: '2.5rem',
        backgroundColor: '#dcfce7',
        padding: '0.6rem',
        borderRadius: '12px'
    },
    title: {
        fontSize: '1.4rem',
        fontWeight: '700',
        color: '#1e293b',
        margin: 0
    },
    subtitle: {
        fontSize: '0.875rem',
        color: '#64748b',
        margin: '0.2rem 0 0 0'
    },
    errorBanner: {
        backgroundColor: '#fef2f2',
        color: '#b91c1c',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        fontSize: '0.9rem',
        marginBottom: '1rem'
    },
    statusSection: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc',
        padding: '0.85rem 1.2rem',
        borderRadius: '10px',
        marginBottom: '1.25rem'
    },
    statusLabel: {
        fontWeight: '600',
        color: '#334155',
        fontSize: '0.95rem'
    },
    badge: {
        padding: '0.35rem 0.85rem',
        borderRadius: '20px',
        fontSize: '0.85rem',
        fontWeight: '600'
    },
    badgeConnected: {
        backgroundColor: '#dcfce7',
        color: '#15803d'
    },
    badgeReady: {
        backgroundColor: '#fef3c7',
        color: '#b45309'
    },
    badgeInitializing: {
        backgroundColor: '#dbeafe',
        color: '#1d4ed8'
    },
    badgeDisconnected: {
        backgroundColor: '#fee2e2',
        color: '#b91c1c'
    },
    infoBox: {
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '10px',
        padding: '1rem',
        fontSize: '0.95rem',
        color: '#166534',
        marginBottom: '1.5rem'
    },
    infoDesc: {
        fontSize: '0.85rem',
        color: '#15803d',
        marginTop: '0.3rem'
    },
    connectedCard: {
        textAlign: 'center',
        padding: '1.5rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '1rem'
    },
    successIcon: {
        fontSize: '3rem',
        marginBottom: '0.5rem'
    },
    connectedTitle: {
        fontSize: '1.25rem',
        fontWeight: '700',
        color: '#15803d',
        margin: '0 0 0.5rem 0'
    },
    connectedText: {
        fontSize: '0.95rem',
        color: '#334155',
        margin: '0 0 0.5rem 0'
    },
    connectedSubtext: {
        fontSize: '0.85rem',
        color: '#64748b',
        lineHeight: '1.4'
    },
    actionButtons: {
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'center',
        marginTop: '1.5rem',
        flexWrap: 'wrap'
    },
    testBtn: {
        backgroundColor: '#16a34a',
        color: '#ffffff',
        border: 'none',
        padding: '0.65rem 1.25rem',
        borderRadius: '8px',
        fontWeight: '600',
        cursor: 'pointer',
        fontSize: '0.9rem',
        transition: 'background-color 0.2s'
    },
    logoutBtn: {
        backgroundColor: '#ef4444',
        color: '#ffffff',
        border: 'none',
        padding: '0.65rem 1.25rem',
        borderRadius: '8px',
        fontWeight: '600',
        cursor: 'pointer',
        fontSize: '0.9rem'
    },
    testResultBox: {
        marginTop: '1rem',
        padding: '0.75rem',
        borderRadius: '8px',
        backgroundColor: '#ffffff',
        border: '1px solid #cbd5e1',
        fontSize: '0.875rem',
        color: '#1e293b'
    },
    qrSection: {
        textAlign: 'center',
        padding: '1rem 0'
    },
    qrTitle: {
        fontSize: '1.2rem',
        fontWeight: '700',
        color: '#1e293b',
        margin: '0 0 0.25rem 0'
    },
    qrSubtitle: {
        fontSize: '0.875rem',
        color: '#64748b',
        margin: '0 0 1.25rem 0'
    },
    qrContainer: {
        display: 'inline-block',
        padding: '1rem',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        border: '2px dashed #16a34a',
        marginBottom: '1.25rem'
    },
    qrImage: {
        width: '240px',
        height: '240px',
        display: 'block'
    },
    instructions: {
        textAlign: 'left',
        backgroundColor: '#f8fafc',
        padding: '1rem 1.25rem',
        borderRadius: '10px',
        fontSize: '0.875rem',
        color: '#334155'
    },
    step: {
        marginBottom: '0.4rem'
    },
    loadingSection: {
        textAlign: 'center',
        padding: '2.5rem 1rem'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '4px solid #e2e8f0',
        borderTop: '4px solid #16a34a',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 1rem auto'
    },
    loadingText: {
        color: '#64748b',
        fontSize: '0.95rem'
    },
    footerNote: {
        textAlign: 'center',
        fontSize: '0.78rem',
        color: '#94a3b8',
        marginTop: '1.5rem',
        borderTop: '1px solid #f1f5f9',
        paddingTop: '1rem'
    }
};

export default WhatsAppQR;
