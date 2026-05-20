export const categories = [
    { id: 1, name: 'Indian Mangoes', slug: 'indian-mangoes', image: '/assets/indianmango.png' },
    { id: 2, name: 'Foreigner Mango', slug: 'foreigner-mango', image: '/assets/foreignmango.png' },
    { id: 3, name: 'Malta Orange', slug: 'malta-orange', image: '/assets/maltaorange.png' },
    { id: 4, name: 'Orange', slug: 'orange', image: '/assets/orange.png' },
    { id: 5, name: 'Guava', slug: 'guava', image: '/assets/guava.png' },
    { id: 6, name: 'Jackfruit', slug: 'jackfruit', image: '/assets/jackfruit.png' },
    { id: 7, name: 'Jamun', slug: 'jamun', image: '/assets/jamun.png' },
    { id: 8, name: 'Water Apple', slug: 'water-apple', image: '/assets/watterapple.png' },
    { id: 9, name: 'Chiku', slug: 'chiku', image: '/assets/chiku.png' },
    { id: 10, name: 'Coconut', slug: 'coconut', image: '/assets/coconut.png' },
    { id: 11, name: 'Betel Nut', slug: 'betel-nut', image: '/assets/betelnut.png' },
    { id: 12, name: 'Lemon', slug: 'lemon', image: '/assets/lemon.png' },
    { id: 13, name: 'Amloki', slug: 'amloki', image: '/assets/amloki.png' },
    { id: 14, name: 'Longon', slug: 'longon', image: '/assets/longan.png' },
    { id: 15, name: 'Litchi', slug: 'litchi', image: '/assets/litchi.png' },
    { id: 16, name: 'Anar', slug: 'anar', image: '/assets/pomegranant.png' },
    { id: 17, name: 'Grape', slug: 'grape', image: '/assets/grapes.png' },
    { id: 18, name: 'Fruit Tree', slug: 'fruit-tree', image: '/assets/fruittree.png' },
    { id: 19, name: 'Others', slug: 'others', image: '/assets/others.png' },
    { id: 20, name: 'Drum Plants', slug: 'drum-plants', image: '/assets/drumplants.png' },
];

/** Image URL for category circles: prefer static /assets/ map so UI works even if the API DB still has old placeholders. */
export function resolveCategoryImageUrl(cat) {
    if (!cat?.slug) return cat?.image || '';
    const def = categories.find((c) => c.slug === cat.slug);
    return def?.image || cat.image || '';
}

/** Shown first in category strips and lists (Foreigner, then Indian). */
export const STOREFRONT_PRIORITY_CATEGORY_SLUGS = ['foreigner-mango', 'indian-mangoes'];

/** `product.category` values from the API for the same priority (must match DB). */
export const STOREFRONT_PRIORITY_PRODUCT_CATEGORY_NAMES = ['Foreigner Mango', 'Indian Mangoes'];

/**
 * Puts Foreigner Mango and Indian Mangoes ahead of other categories; keeps relative order elsewhere.
 * @param {Array<{ slug?: string }>} items
 */
export function sortCategoriesWithMangoFirst(items) {
    if (!Array.isArray(items)) return [];
    const priority = STOREFRONT_PRIORITY_CATEGORY_SLUGS
        .map((slug) => items.find((c) => c.slug === slug))
        .filter(Boolean);
    const prioritySlugs = new Set(priority.map((c) => c.slug));
    const rest = items.filter((c) => !prioritySlugs.has(c.slug));
    return [...priority, ...rest];
}

/**
 * Puts products in Foreigner Mango, then Indian Mangoes, then all others (stable; preserves order within each band).
 */
export function sortProductsWithMangoFirst(products) {
    if (!Array.isArray(products)) return [];
    const fallback = STOREFRONT_PRIORITY_PRODUCT_CATEGORY_NAMES.length;
    const rank = (p) => {
        const i = STOREFRONT_PRIORITY_PRODUCT_CATEGORY_NAMES.indexOf(p?.category || '');
        return i === -1 ? fallback : i;
    };
    return [...products].sort((a, b) => rank(a) - rank(b));
}
