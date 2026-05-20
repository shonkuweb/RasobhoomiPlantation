import { createContext, useState, useEffect, useContext } from 'react';
import { sortProductsWithMangoFirst } from '../utils/categories';

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
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        let cancelled = false;

        const loadProducts = async () => {
            try {
                const res = await fetch('/api/products?summary=1');
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const list = Array.isArray(data) ? data : (data.products || []);
                setProducts(sortProductsWithMangoFirst(list));
            } catch (error) {
                console.error('Failed to fetch products', error);
            } finally {
                if (!cancelled) setIsLoadingInitial(false);
            }
        };

        loadProducts();
        return () => {
            cancelled = true;
        };
    }, []);

    const fetchProducts = async () => {
        setIsLoadingInitial(true);
        try {
            const res = await fetch('/api/products?summary=1');
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.products || []);
                setProducts(sortProductsWithMangoFirst(list));
            }
        } catch (error) {
            console.error('Failed to fetch products', error);
        } finally {
            setIsLoadingInitial(false);
        }
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
        isLoadingInitial,
    };

    return (
        <ShopContext.Provider value={value}>
            {children}
        </ShopContext.Provider>
    );
};
