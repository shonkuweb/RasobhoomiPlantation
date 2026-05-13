export const categories = [
    { id: 1, name: 'Indian Mangoes', slug: 'indian-mangoes', image: '/assets/indianmango.png' },
    { id: 2, name: 'Foreigner Mango', slug: 'foreigner-mango', image: '/assets/foreignmango.png' },
    { id: 3, name: 'Malta Orange', slug: 'malta-orange', image: '/assets/maltaorange.png' },
    { id: 4, name: 'Orange', slug: 'orange', image: 'https://placehold.co/150?text=Orange' },
    { id: 5, name: 'Guava', slug: 'guava', image: '/assets/guava.png' },
    { id: 6, name: 'Jackfruit', slug: 'jackfruit', image: '/assets/jackfruit.png' },
    { id: 7, name: 'Jamun', slug: 'jamun', image: '/assets/jamun.png' },
    { id: 8, name: 'Water Apple', slug: 'water-apple', image: '/assets/watterapple.png' },
    { id: 9, name: 'Chiku', slug: 'chiku', image: '/assets/chiku.png' },
    { id: 10, name: 'Coconut', slug: 'coconut', image: 'https://placehold.co/150?text=Coconut' },
    { id: 11, name: 'Betel Nut', slug: 'betel-nut', image: 'https://placehold.co/150?text=Betel+Nut' },
    { id: 12, name: 'Lemon', slug: 'lemon', image: '/assets/lemon.png' },
    { id: 13, name: 'Amloki', slug: 'amloki', image: '/assets/amloki.png' },
    { id: 14, name: 'Longon', slug: 'longon', image: 'https://placehold.co/150?text=Longon' },
    { id: 15, name: 'Litchi', slug: 'litchi', image: '/assets/litchi.png' },
    { id: 16, name: 'Currant', slug: 'currant', image: 'https://placehold.co/150?text=Currant' },
    { id: 17, name: 'Grape', slug: 'grape', image: 'https://placehold.co/150?text=Grape' },
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
