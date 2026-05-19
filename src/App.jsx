import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ShopProvider } from './context/ShopContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import CartSidebar from './components/CartSidebar';
import Footer from './components/Footer';
import WhatsAppButton from './components/WhatsAppButton';
import Home from './pages/Home';

const ProductDetails = lazy(() => import('./pages/ProductDetails'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentSuccess = lazy(() => import('./pages/PaymentSuccess'));
const PaymentFailure = lazy(() => import('./pages/PaymentFailure'));
const PaymentPending = lazy(() => import('./pages/PaymentPending'));
const Categories = lazy(() => import('./pages/Categories'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Refund = lazy(() => import('./pages/Refund'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const Terms = lazy(() => import('./pages/Terms'));
const Return = lazy(() => import('./pages/Return'));
const Shipping = lazy(() => import('./pages/Shipping'));
const Privacy = lazy(() => import('./pages/Privacy'));

const PageFallback = () => (
    <div style={{ textAlign: 'center', padding: '2rem' }}>Loading...</div>
);

const ScrollToTop = () => {
    const { pathname } = useLocation();
    React.useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);
    return null;
};

function AppContent() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [cartOpen, setCartOpen] = useState(false);
    const location = useLocation();

    const showFooter = !location.pathname.includes('/admin');

    return (
        <div className="app-container">
            <ScrollToTop />
            <Navbar
                onMenuClick={() => setSidebarOpen(true)}
                onCartClick={() => setCartOpen(true)}
            />

            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <CartSidebar isOpen={cartOpen} onClose={() => setCartOpen(false)} />

            {(sidebarOpen || cartOpen) && (
                <div
                    className="overlay active"
                    onClick={() => {
                        setSidebarOpen(false);
                        setCartOpen(false);
                    }}
                ></div>
            )}

            <Suspense fallback={<PageFallback />}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/categories" element={<Categories />} />
                    <Route path="/category/:slug" element={<CategoryPage />} />
                    <Route path="/product/:id" element={<ProductDetails />} />
                    <Route path="/checkout" element={<Checkout />} />
                    <Route path="/payment/success" element={<PaymentSuccess />} />
                    <Route path="/payment/failure" element={<PaymentFailure />} />
                    <Route path="/payment/pending" element={<PaymentPending />} />
                    <Route path="/track-order" element={<TrackOrder />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/refund" element={<Refund />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/return" element={<Return />} />
                    <Route path="/shipping" element={<Shipping />} />
                    <Route path="/privacy" element={<Privacy />} />
                </Routes>
            </Suspense>

            {showFooter && <Footer />}
            <WhatsAppButton />
        </div>
    );
}

const App = () => {
    return (
        <ShopProvider>
            <Router>
                <AppContent />
            </Router>
        </ShopProvider>
    );
};

export default App;
