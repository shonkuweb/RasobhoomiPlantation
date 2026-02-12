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
                <Link to="/terms" className="menu-item" onClick={onClose}>Terms & Conditions</Link>
                <Link to="/refund" className="menu-item" onClick={onClose}>Refund Policy</Link>
                <Link to="/return" className="menu-item" onClick={onClose}>Return Policy</Link>
                <Link to="/shipping" className="menu-item" onClick={onClose}>Shipping Policy</Link>
                <Link to="/privacy" className="menu-item" onClick={onClose}>Privacy Policy</Link>
                <Link to="/track-order" className="menu-item" onClick={onClose}>Track Your Order</Link>
                <Link to="/" className="menu-item" onClick={onClose}>Home</Link>
            </div>
            <div className="admin-link-container">
                <Link to="/admin" className="admin-link" onClick={onClose}>
                    Admin Panel
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                </Link>
            </div>
        </aside>
    );
};

export default Sidebar;
