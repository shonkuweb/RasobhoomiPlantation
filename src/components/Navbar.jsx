import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import { sortProductsWithMangoFirst } from '../utils/categories';

const Navbar = ({ onMenuClick, onCartClick }) => {
    const { cart, products, searchQuery, setSearchQuery } = useShop();
    const { language, setLanguage, t, translateProduct } = useLanguage();
    const [searchOpen, setSearchOpen] = useState(false);
    const [langOpen, setLangOpen] = useState(false);
    const searchRef = useRef(null);
    const langRef = useRef(null);

    const cartCount = cart.reduce((acc, item) => acc + item.qty, 0);
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const searchResults = useMemo(() => {
        if (!normalizedQuery) return [];
        return sortProductsWithMangoFirst(
            products.filter((p) => {
                const translated = translateProduct(p);
                return (p.name || '').toLowerCase().includes(normalizedQuery) ||
                    (p.description || '').toLowerCase().includes(normalizedQuery) ||
                    (p.category || '').toLowerCase().includes(normalizedQuery) ||
                    (translated.name || '').toLowerCase().includes(normalizedQuery) ||
                    (translated.category || '').toLowerCase().includes(normalizedQuery);
            })
        ).slice(0, 8);
    }, [normalizedQuery, products, translateProduct]);

    const showDropdown = normalizedQuery.length > 0 && searchOpen;

    useEffect(() => {
        const handleOutsideClick = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setSearchOpen(false);
            }
            if (langRef.current && !langRef.current.contains(event.target)) {
                setLangOpen(false);
            }
        };
        const handleEsc = (event) => {
            if (event.key === 'Escape') {
                setSearchOpen(false);
                setLangOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEsc);
        };
    }, []);

    return (
        <nav className={`navbar ${searchOpen ? 'search-active' : ''}`}>

            {/* Logo Image & Text (Left) */}
            <Link to="/" className="nav-logo" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <img src="/assets/logo.png" alt="Rasobhoomi" className="logo-img" style={{ height: '40px' }} />
                <span className="navbar-brand-text" style={{ fontFamily: 'var(--font-family)', fontWeight: 'bold', fontSize: '1.5rem' }}>Rasobhoomi</span>
            </Link>

            {/* Search Bar (Mobile Toggle) */}
            <div className="search-bar-container" ref={searchRef}>
                <div className="search-input-wrapper pill-search">
                    <span className="pill-icon-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </span>
                    <input
                        type="text"
                        id="navbar-search-input"
                        placeholder={t('search_placeholder')}
                        autoComplete="off"
                        autoFocus={searchOpen}
                        value={searchQuery}
                        onFocus={() => setSearchOpen(true)}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button id="close-navbar-search" className="pill-icon-right" onClick={() => setSearchOpen(false)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                {showDropdown && (
                    <div className="navbar-search-dropdown">
                        {searchResults.length > 0 ? (
                            searchResults.map((rawProduct) => {
                                const product = translateProduct(rawProduct);
                                return (
                                    <Link
                                        key={product.id}
                                        to={`/product/${product.id}`}
                                        className="navbar-search-item"
                                        onClick={() => setSearchOpen(false)}
                                    >
                                        <div className="navbar-search-item-image">
                                            {product.image ? (
                                                <img src={product.image} alt={product.name} />
                                            ) : (
                                                <span>IMG</span>
                                            )}
                                        </div>
                                        <div className="navbar-search-item-content">
                                            <span className="navbar-search-item-name">{product.name}</span>
                                            <span className="navbar-search-item-meta">
                                                {product.category || 'Plant'} - ₹{product.price}
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })
                        ) : (
                            <div className="navbar-search-empty">{t('search_no_results')}</div>
                        )}
                    </div>
                )}
            </div>

            <div className="nav-actions" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                {/* Language Selector Icon Button & Popover */}
                <div className="language-selector-wrapper" ref={langRef} style={{ position: 'relative' }}>
                    <button
                        id="language-toggle-btn"
                        className="nav-icon"
                        onClick={() => setLangOpen(!langOpen)}
                        title={t('language')}
                        aria-label={t('language')}
                        style={{ position: 'relative' }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        <span className="lang-code-badge">{language.toUpperCase()}</span>
                    </button>

                    {langOpen && (
                        <div className="language-popover-menu">
                            <button
                                className={`lang-option-btn ${language === 'en' ? 'active' : ''}`}
                                onClick={() => { setLanguage('en'); setLangOpen(false); }}
                            >
                                English <span>(EN)</span>
                            </button>
                            <button
                                className={`lang-option-btn ${language === 'hi' ? 'active' : ''}`}
                                onClick={() => { setLanguage('hi'); setLangOpen(false); }}
                            >
                                हिंदी <span>(HI)</span>
                            </button>
                            <button
                                className={`lang-option-btn ${language === 'bn' ? 'active' : ''}`}
                                onClick={() => { setLanguage('bn'); setLangOpen(false); }}
                            >
                                বাংলা <span>(BN)</span>
                            </button>
                        </div>
                    )}
                </div>

                <a href="/admin" className="nav-icon" title={t('admin_panel')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </a>

                <button id="search-toggle" className="nav-icon" onClick={() => setSearchOpen(!searchOpen)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </button>

                <button id="cart-btn" className="nav-icon" onClick={onCartClick} style={{ position: 'relative' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    {cartCount > 0 && <span className="cart-badge">{cartCount > 99 ? '99+' : cartCount}</span>}
                </button>

                <button id="menu-btn" className="nav-icon" onClick={onMenuClick}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
