import React, { useEffect, useState } from 'react';
import { useShop } from '../context/ShopContext';
import { useLanguage } from '../context/LanguageContext';
import ProductCard from '../components/ProductCard';
import { Link } from 'react-router-dom';
import FilterModal from '../components/FilterModal';
import SEO from '../components/SEO';
import HeroVideoBanner, { extractYouTubeId, isYouTubeShorts } from '../components/HeroVideoBanner';
import { resolveCategoryImageUrl, sortCategoriesWithMangoFirst, sortProductsWithMangoFirst } from '../utils/categories';
import { translateCategoryName } from '../utils/translations';

const Home = () => {
    const { products, searchQuery, isLoadingInitial } = useShop();
    const { language, t } = useLanguage();
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState({});
    const [categories, setCategories] = useState([]);
    const [heroVideoUrl, setHeroVideoUrl] = useState('');

    useEffect(() => {
        fetch('/api/categories')
            .then(res => res.json())
            .then(data => setCategories(data))
            .catch(err => console.error("Failed to fetch categories", err));

        fetch('/api/settings/hero-video')
            .then(res => res.json())
            .then(data => {
                if (data && data.heroVideoUrl) {
                    setHeroVideoUrl(data.heroVideoUrl);
                }
            })
            .catch(err => console.error("Failed to fetch hero video setting", err));
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

        setFilteredProducts(sortProductsWithMangoFirst(result));
    }, [products, searchQuery, activeFilters]);

    const handleApplyFilter = (filters) => {
        setActiveFilters(filters);
        setIsFilterOpen(false);
    };

    const formatCategoryName = (name) => {
        return translateCategoryName(name, language);
    };

    const hasValidHeroVideo = Boolean(extractYouTubeId(heroVideoUrl));
    const isShortsVideo = isYouTubeShorts(heroVideoUrl);

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
            <section className={`hero-carousel ${hasValidHeroVideo ? 'has-video' : ''} ${isShortsVideo ? 'is-shorts' : ''}`} aria-label="Rasobhoomi Plantation">
                {hasValidHeroVideo ? (
                    <HeroVideoBanner url={heroVideoUrl} isShorts={isShortsVideo} />
                ) : (
                    <div className="carousel-track">
                        <img
                            src="/assets/rashero.png"
                            alt="Rasobhoomi Plantation entrance — nursery and plants"
                            className="hero-slide"
                            width="1920"
                            height="1080"
                            decoding="async"
                            fetchPriority="high"
                        />
                    </div>
                )}
            </section>

            {/* View More Tutorials Button Section */}
            <div className="view-tutorials-banner-container">
                <Link to="/tutorials" className="btn-view-tutorials">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="23 7 16 12 23 17 23 7" fill="currentColor"></polygon>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor"></rect>
                    </svg>
                    <span>{t('view_more_tutorials')}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </Link>
            </div>

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
                {sortCategoriesWithMangoFirst(
                    categories.filter(cat => products.some(p => p.category === cat.name))
                ).map(cat => (
                    <Link to={`/category/${cat.slug}`} key={cat.id} className="category-item" style={{ textDecoration: 'none' }}>
                        <div className="cat-circle">
                            {resolveCategoryImageUrl(cat) ? (
                                <img
                                    src={resolveCategoryImageUrl(cat)}
                                    alt=""
                                    className="cat-circle-img"
                                    width={75}
                                    height={75}
                                    loading="lazy"
                                    decoding="async"
                                />
                            ) : (
                                <span className="cat-circle-text">{formatCategoryName(cat.name)}</span>
                            )}
                        </div>
                        <span className="cat-label">{formatCategoryName(cat.name)}</span>
                    </Link>
                ))}
            </section>

            {/* Product Grid */}
            <section id="product-grid" className="product-grid">
                {isLoadingInitial && products.length === 0 ? (
                    <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Loading products...</p>
                ) : filteredProducts.length > 0 ? (
                    filteredProducts.map(p => <ProductCard key={p.id} product={p} />)
                ) : (
                    <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>No products match your filters.</p>
                )}
            </section>

            <FilterModal
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onApply={handleApplyFilter}
                categories={categories}
            />
        </main>
    );
};

export default Home;
