import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar = ({ isOpen, onClose }) => {
    return (
        <aside className={`sidebar ${isOpen ? 'active' : ''}`} id="sidebar">
            <div className="sidebar-header">
                <span className="sidebar-title">MENU</span>
                <button id="close-sidebar" className="sidebar-close" onClick={onClose}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div className="sidebar-menu">
                <Link to="/categories" className="menu-item" onClick={onClose}>Categories</Link>
                <Link to="/about" className="menu-item" onClick={onClose}>About Us</Link>
                <Link to="/contact" className="menu-item" onClick={onClose}>Contact Us</Link>
                <a href="/terms.html" className="menu-item" onClick={onClose}>Terms & Conditions</a>
                <a href="/refund.html" className="menu-item" onClick={onClose}>Refund Policy</a>
                <a href="/return.html" className="menu-item" onClick={onClose}>Return Policy</a>
                <a href="/shipping.html" className="menu-item" onClick={onClose}>Shipping Policy</a>
                <a href="/privacy.html" className="menu-item" onClick={onClose}>Privacy Policy</a>
                <Link to="/track-order" className="menu-item" onClick={onClose}>Track Your Order</Link>
                <Link to="/" className="menu-item" onClick={onClose}>Home</Link>
            </div>
            <div className="admin-link-container">
                <a href="/admin" className="admin-link" onClick={onClose}>
                    Admin Panel
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                </a>
            </div>
        </aside>
    );
};

export default Sidebar;
