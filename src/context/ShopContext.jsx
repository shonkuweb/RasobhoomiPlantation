import { createContext, useState, useEffect, useContext, useRef } from 'react';

const ShopContext = createContext();

export const useShop = () => useContext(ShopContext);

const PRODUCT_BATCH_SIZE = 4;

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
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const pageRef = useRef(0);

    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchProductsBatch(1, true);
    }, []);

    const fetchProductsBatch = async (pageNumber, isInitial = false) => {
        if (!isInitial) setIsLoadingMore(true);
        try {
            const res = await fetch(`/api/products?page=${pageNumber}&limit=${PRODUCT_BATCH_SIZE}`);
            if (!res.ok) return;
            const raw = await res.json();

            const data = Array.isArray(raw) ? raw : (raw.products || []);
            const serverHasMore = Array.isArray(raw)
                ? data.length === PRODUCT_BATCH_SIZE
                : Boolean(raw.hasMore);

            setProducts(prev => {
                const merged = [...prev, ...data];
                return Array.from(new Map(merged.map(item => [item.id, item])).values());
            });

            pageRef.current = pageNumber;
            setHasMore(serverHasMore);

            if (serverHasMore) {
                setTimeout(() => fetchProductsBatch(pageNumber + 1, false), 400);
            }
        } catch (error) {
            console.error('Failed to fetch products', error);
        } finally {
            if (isInitial) setIsLoadingInitial(false);
            if (!isInitial) setIsLoadingMore(false);
        }
    };

    const loadMoreProducts = () => {
        if (!hasMore || isLoadingMore || isLoadingInitial) return;
        fetchProductsBatch(pageRef.current + 1, false);
    };

    const fetchProducts = () => {
        setProducts([]);
        pageRef.current = 0;
        setHasMore(true);
        setIsLoadingInitial(true);
        fetchProductsBatch(1, true);
    };

    const addToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        if (product.qty <= 0) {
            alert('Out of stock');
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.id === productId);
            if (existing) {
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
        fetchProducts,
        loadMoreProducts,
        hasMore,
        isLoadingInitial,
        isLoadingMore,
    };

    return (
        <ShopContext.Provider value={value}>
            {children}
        </ShopContext.Provider>
    );
};
