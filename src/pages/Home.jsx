import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import ProductCard from '../components/ProductCard';
import { Link } from 'react-router-dom';
import FilterModal from '../components/FilterModal';
import SEO from '../components/SEO';
// import { categories } from '../utils/categories';

const Home = () => {
    const { products, searchQuery } = useShop();
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({});
    const [categories, setCategories] = useState([]);

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error("Failed to fetch categories", err));
    }, []);

    useEffect(() => {
        let result = [...products];

        // 1. Search Query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(query) ||
                (p.description && p.description.toLowerCase().includes(query))
            );
        }

        // 2. Active Filters
        if (activeFilters.stock) {
            result = result.filter(p => p.qty > 0);
        }

        if (activeFilters.categories && activeFilters.categories.length > 0) {
            result = result.filter(p => activeFilters.categories.includes(p.category));
        }

        if (activeFilters.sort === 'lowHigh') {
            result.sort((a, b) => a.price - b.price);
        } else if (activeFilters.sort === 'highLow') {
            result.sort((a, b) => b.price - a.price);
        }

        setFilteredProducts(result);
    }, [products, searchQuery, activeFilters]);

    const handleApplyFilter = (filters) => {
        setActiveFilters(filters);
        setIsFilterOpen(false);
    };

    return (
        <main className="home-main">
            <SEO
                title="Rasobhoomi Plantation - Authentic Plants & Greenery"
                description="Explore our exclusive collection of healthy plants, fruit trees, and indoor greenery. Grown with love."
                keywords="plants, nursery, fruit trees, indoor plants, gardening, greenery"
                structuredData={{
                    "@context": "https://schema.org",
                    "name": "Rasobhoomi Plantation",
                    "description": "Authentic plants and greenery nursery.",
                    "url": window.location.origin,
                    "logo": `${window.location.origin}/logo.png`
                }}
            />
            {/* Hero Section */}
            <section className="hero-carousel">
                <div className="carousel-track">
                    {/* Assuming images are in public/hero/ */}
                    <img src="/hero/Gemini_Generated_Image_ufccdnufccdnufcc.png" alt="Rasobhoomi Nursery & Plants" className="hero-slide" />
                </div>
            </section>

            {/* Filter Section */}
            <section className="filter-section">
                <button id="filter-btn" className="filter-btn" onClick={() => setIsFilterOpen(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="4" y1="21" x2="4" y2="14"></line>
                        <line x1="4" y1="10" x2="4" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12" y2="3"></line>
                        <line x1="20" y1="21" x2="20" y2="16"></line>
                        <line x1="20" y1="12" x2="20" y2="3"></line>
                        <line x1="1" y1="14" x2="7" y2="14"></line>
                        <line x1="9" y1="8" x2="15" y2="8"></line>
                        <line x1="17" y1="16" x2="23" y2="16"></line>
                    </svg>
                    FILTER & SORTING
                </button>
            </section>

            {/* Categories */}
            {/* Categories */}
            <section className="category-list">
                {categories
                    .filter(cat => cat.name === 'Drum Plants' || products.some(p => p.category === cat.name))
                    .map(cat => (
                        <Link to={`/category/${cat.slug}`} key={cat.id} className="category-item" style={{ textDecoration: 'none' }}>
                            <div className="cat-circle">
                                <span className="cat-circle-text">{cat.name}</span>
                            </div>
                            <span className="cat-label">{cat.name}</span>
                        </Link>
                    ))}
            </section>

            {/* Product Grid */}
            <section id="product-grid" className="product-grid">
                {products.length === 0 ? (
                    <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Loading products...</p>
                ) : (
                    filteredProducts.length > 0 ? (
                        filteredProducts.map(p => <ProductCard key={p.id} product={p} />)
                    ) : (
                        <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>No products match your filters.</p>
                    )
                )}
            </section>

            {/* WhatsApp Contact Banner */}
            <section className="whatsapp-banner">
                <div className="whatsapp-banner-content">
                    <div className="whatsapp-banner-text">
                        <h3>🌿 Need help choosing the right plant?</h3>
                        <p>Chat with us on WhatsApp — we're happy to guide you!</p>
                    </div>
                    <a
                        href={`https://wa.me/918972076182?text=${encodeURIComponent("Hi Rasobhoomi! I'm browsing your website and I'd love to know more about your plants.")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="whatsapp-banner-btn"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white">
                            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                        </svg>
                        Chat on WhatsApp
                    </a>
                </div>
            </section>

            <FilterModal
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApply={handleApplyFilter}
            />
        </main>
    );
};

export default Home;
