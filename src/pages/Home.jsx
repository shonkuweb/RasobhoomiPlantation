import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import ProductCard from '../components/ProductCard';
import { Link } from 'react-router-dom';
import FilterModal from '../components/FilterModal';

const Home = () => {
    const { products, searchQuery } = useShop();
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({});

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
            {/* Hero Section */}
            <section className="hero-carousel">
                <div className="carousel-track">
                    {/* Assuming images are in public/hero/ */}
                    <img src="/hero/slide1.jpg" alt="Handloom Heritage" className="hero-slide" />
                    <img src="/hero/slide2.jpg" alt="Handloom Collection" className="hero-slide" />
                    <img src="/hero/slide3.jpg" alt="Timeless Weaves" className="hero-slide" />
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
            <section className="category-list">
                <Link to="/category/surat-silk" className="category-item" style={{ textDecoration: 'none' }}>
                    <div className="cat-circle">
                        <img src="/categories/surat-silk.jpg" alt="Surat Silk"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    </div>
                    <span className="cat-label">Surat Silk<br />Special</span>
                </Link>
                <Link to="/category/handloom" className="category-item" style={{ textDecoration: 'none' }}>
                    <div className="cat-circle">
                        <img src="/categories/handloom-special.png" alt="Handloom Special"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    </div>
                    <span className="cat-label">Handloom<br />Special</span>
                </Link>
                <Link to="/category/shantipuri" className="category-item" style={{ textDecoration: 'none' }}>
                    <div className="cat-circle">
                        <img src="/categories/shantipuri-special.png" alt="Shantipuri Special"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    </div>
                    <span className="cat-label">Shantipuri<br />Special</span>
                </Link>
                <Link to="/category/cotton" className="category-item" style={{ textDecoration: 'none' }}>
                    <div className="cat-circle">
                        <img src="/categories/cotton-varieties.png" alt="Cotton Varieties"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    </div>
                    <span className="cat-label">Cotton<br />Varieties</span>
                </Link>
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

            <FilterModal
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApply={handleApplyFilter}
            />
        </main>
    );
};

export default Home;
