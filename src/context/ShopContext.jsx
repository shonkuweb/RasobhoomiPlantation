import { createContext, useState, useEffect, useContext } from 'react';

const ShopContext = createContext();

export const useShop = () => useContext(ShopContext);

export const ShopProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('cart') || '[]');
        } catch {
            return [];
        }
    });
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(1);

    // We keep search query inside context as before
    const [searchQuery, setSearchQuery] = useState('');

    const LIMIT = 6;

    useEffect(() => {
        // Initial fetch on mount
        fetchProductsBatch(1, true);
    }, []);

    const fetchProductsBatch = async (pageNumber, isInitial = false) => {
        try {
            const res = await fetch(`/api/products?page=${pageNumber}&limit=${LIMIT}`);
            if (res.ok) {
                const raw = await res.json();

                // Handle both new {products, hasMore} format and old array format
                const data = Array.isArray(raw) ? raw : (raw.products || []);
                const serverHasMore = Array.isArray(raw) ? (data.length === LIMIT) : raw.hasMore;

                setProducts(prev => {
                    const newProducts = [...prev, ...data];
                    const uniqueProducts = Array.from(new Map(newProducts.map(item => [item.id, item])).values());
                    return uniqueProducts;
                });

                if (!serverHasMore) {
                    setHasMore(false); // Server says no more products
                } else {
                    // Fetch next batch in the background
                    setTimeout(() => {
                        fetchProductsBatch(pageNumber + 1);
                    }, 500);
                }
            }
        } catch (error) {
            console.error('Failed to fetch products', error);
        } finally {
            if (isInitial) {
                setIsLoadingInitial(false);
            }
        }
    };

    const fetchProducts = () => {
        setProducts([]); // Clear existing to prevent duplicate appends on manual refresh
        setPage(1);
        setHasMore(true);
        fetchProductsBatch(1, true);
    };

    const addToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        if (product.qty <= 0) {
            alert('Out of stock'); // Replace with Toast later
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === productId);
            if (existing) {
                // Check stock limit logic if needed
                return prev.map(item =>
                    item.id === productId ? { ...item, qty: item.qty + 1 } : item
                );
            }
            return [...prev, { id: productId, qty: 1 }];
        });
    };

    const removeFromCart = (productId) => {
        setCart(prev => prev.filter(item => item.id !== productId));
    };

    const updateQty = (productId, newQty) => {
        if (newQty < 1) {
            removeFromCart(productId);
            return;
        }
        setCart(prev => prev.map(item =>
            item.id === productId ? { ...item, qty: newQty } : item
        ));
    };

    const clearCart = () => setCart([]);

    const getCartTotal = () => {
        return cart.reduce((acc, item) => {
            const product = products.find(p => p.id === item.id);
            // Handle cost if product missing or price formatting
            const price = product ? (typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0) : 0;
            return acc + (price * item.qty);
        }, 0);
    };

    const value = {
        products,
        cart,
        searchQuery,
        setSearchQuery,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        getCartTotal,
        fetchProducts
    };

    return (
        <ShopContext.Provider value={value}>
            {children}
        </ShopContext.Provider>
    );
};
