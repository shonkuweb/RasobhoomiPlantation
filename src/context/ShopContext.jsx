import { createContext, useState, useEffect, useContext, useCallback } from 'react';
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
        try {
            localStorage.setItem('cart', JSON.stringify(cart));
        } catch (e) {
            console.error('Failed to save cart', e);
        }
    }, [cart]);

    const normalizeCat = (s) => (s || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '')
        .replace(/foreigner/g, 'foreign')
        .replace(/plants/g, 'plant')
        .replace(/mangoes/g, 'mango')
        .replace(/trees/g, 'tree');

    const filterByVisibleCategories = (productList, visibleCats) => {
        if (!Array.isArray(visibleCats) || visibleCats.length === 0) return productList;
        return productList.filter(p => {
            if (!p.category) return true;
            const pNorm = normalizeCat(p.category);
            return visibleCats.some(cat => {
                const catNameNorm = normalizeCat(cat.name);
                const catSlugNorm = normalizeCat(cat.slug);
                return pNorm === catNameNorm || pNorm === catSlugNorm ||
                       (catNameNorm && (pNorm.startsWith(catNameNorm) || catNameNorm.startsWith(pNorm))) ||
                       (catSlugNorm && (pNorm.startsWith(catSlugNorm) || catSlugNorm.startsWith(pNorm)));
            });
        });
    };

    useEffect(() => {
        let cancelled = false;

        const loadProducts = async () => {
            try {
                const [prodRes, catRes] = await Promise.all([
                    fetch('/api/products?summary=1'),
                    fetch('/api/categories').catch(() => null)
                ]);

                if (!prodRes.ok) return;
                const data = await prodRes.json();
                let visibleCats = [];
                if (catRes && catRes.ok) {
                    try {
                        visibleCats = await catRes.json();
                    } catch (e) {}
                }

                if (cancelled) return;
                const rawList = Array.isArray(data) ? data : (data.products || []);
                const filtered = filterByVisibleCategories(rawList, visibleCats);
                setProducts(sortProductsWithMangoFirst(filtered));
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
            const [prodRes, catRes] = await Promise.all([
                fetch('/api/products?summary=1'),
                fetch('/api/categories').catch(() => null)
            ]);

            if (prodRes.ok) {
                const data = await prodRes.json();
                let visibleCats = [];
                if (catRes && catRes.ok) {
                    try {
                        visibleCats = await catRes.json();
                    } catch (e) {}
                }
                const rawList = Array.isArray(data) ? data : (data.products || []);
                const filtered = filterByVisibleCategories(rawList, visibleCats);
                setProducts(sortProductsWithMangoFirst(filtered));
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

    const clearCart = useCallback(() => {
        setCart([]);
    }, []);

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
