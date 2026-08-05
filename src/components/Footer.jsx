import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

const Footer = () => {
    const { t } = useLanguage();

    return (
        <footer className="footer">
            <div className="footer-grid">
                {/* Column 1: Brand Info */}
                <div className="footer-col brand-col">
                    <h2 className="footer-logo">Rasobhoomi</h2>
                    <p className="footer-tagline">
                        {t('footer_tagline')}
                    </p>
                </div>

                {/* Column 2: Quick Links */}
                <div className="footer-col">
                    <h3 className="footer-heading">{t('quick_links')}</h3>
                    <ul className="footer-links-list">
                        <li><Link to="/" className="footer-link-item">{t('nav_home')}</Link></li>
                        <li><Link to="/categories" className="footer-link-item">{t('nav_categories')}</Link></li>
                        <li><Link to="/tutorials" className="footer-link-item">{t('nav_tutorials')}</Link></li>
                        <li><Link to="/about" className="footer-link-item">{t('nav_about')}</Link></li>
                        <li><Link to="/contact" className="footer-link-item">{t('nav_contact')}</Link></li>
                    </ul>
                </div>

                {/* Column 3: Customer Care */}
                <div className="footer-col">
                    <h3 className="footer-heading">{t('customer_care')}</h3>
                    <ul className="footer-links-list">
                        <li><Link to="/track-order" className="footer-link-item">{t('nav_track')}</Link></li>
                        <li><Link to="/refund" className="footer-link-item">{t('nav_refund')}</Link></li>
                        <li><Link to="/terms" className="footer-link-item">{t('nav_terms')}</Link></li>
                        <li><Link to="/return" className="footer-link-item">{t('nav_return')}</Link></li>
                        <li><Link to="/shipping" className="footer-link-item">{t('nav_shipping')}</Link></li>
                        <li><Link to="/privacy" className="footer-link-item">{t('nav_privacy')}</Link></li>
                    </ul>
                </div>

                {/* Column 4: Stay Connected */}
                <div className="footer-col">
                    <h3 className="footer-heading">{t('stay_connected')}</h3>
                    <div className="social-icons">
                        <a href="https://wa.me/918972076182?text=Hi" target="_blank" rel="noreferrer" className="social-icon" title="WhatsApp">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </a>
                        <a href="#" className="social-icon" title="Instagram">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                            </svg>
                        </a>
                        <a href="#" className="social-icon" title="Facebook">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                            </svg>
                        </a>
                    </div>
                    <div className="footer-contact-info" style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#000' }}>
                        <p style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📍</span>
                            <strong style={{ color: '#000' }}>Baikara, NORTH 24 PARAGANAS, WEST BENGAL - 743245</strong>
                        </p>
                        <p style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📧</span>
                            <a href="mailto:rasobhoomiplantation@gmail.com" style={{ color: '#000', textDecoration: 'none', fontWeight: 'bold' }}>rasobhoomiplantation@gmail.com</a>
                        </p>
                        <p style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>📞</span>
                            <a href="tel:+918972076182" style={{ color: '#000', textDecoration: 'none', fontWeight: 'bold' }}>+91 8972076182</a>
                        </p>
                    </div>
                </div>
            </div>

            <div className="copyright">
                &copy; {new Date().getFullYear()} Rasobhoomi. {t('all_rights_reserved')}
            </div>
        </footer>
    );
};

export default Footer;
