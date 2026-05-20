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
