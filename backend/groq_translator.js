import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Call Groq API to translate a batch of products into target language ('hi' or 'bn').
 */
export async function translateProductsWithGroq(products, targetLang) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn('[GROQ] GROQ_API_KEY is not set in environment. Skipping AI translation.');
        return [];
    }

    if (!Array.isArray(products) || products.length === 0) {
        return [];
    }

    const langName = targetLang === 'hi' ? 'Hindi' : 'Bengali';
    const payloadItems = products.map(p => ({
        id: String(p.id),
        name: p.name || '',
        description: p.description || '',
        category: p.category || ''
    }));

    const systemPrompt = `You are a professional botanical and horticultural translator for an Indian plant nursery. 
Translate the provided plant products into fluent, natural ${langName}.
Maintain accuracy for plant varieties, fruits, and farming terms.
You MUST output a JSON object containing an array under key "translations":
{
  "translations": [
    {
      "id": "exact_product_id",
      "name": "translated plant name in ${langName}",
      "description": "translated description in ${langName}",
      "category": "translated category in ${langName}"
    }
  ]
}`;

    try {
        console.log(`[GROQ] Requesting ${langName} translations for ${products.length} products...`);
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(payloadItems) }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`[GROQ] API Error (${response.status}):`, errText);
            return [];
        }

        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content;
        if (!rawContent) return [];

        console.log(`[GROQ] Raw response received (${rawContent.length} chars)`);
        const parsed = JSON.parse(rawContent);

        let rawList = [];
        if (Array.isArray(parsed)) {
            rawList = parsed;
        } else if (Array.isArray(parsed.translations)) {
            rawList = parsed.translations;
        } else if (Array.isArray(parsed.products)) {
            rawList = parsed.products;
        } else if (Array.isArray(parsed.items)) {
            rawList = parsed.items;
        } else if (parsed && typeof parsed === 'object') {
            if (parsed.id && (parsed.name || parsed.title)) {
                rawList = [parsed];
            } else {
                rawList = Object.keys(parsed).map(key => {
                    const item = parsed[key];
                    if (typeof item === 'object' && item !== null) {
                        return { id: key, ...item };
                    }
                    return null;
                }).filter(Boolean);
            }
        }

        const normalizedList = rawList.map(item => {
            if (!item) return null;
            const itemId = String(item.id || item.productId || item.product_id || '');
            if (!itemId) return null;

            const name = item.name || item.translated_name || item[`${langName.toLowerCase()}_name`] || item.title || '';
            const description = item.description || item.translated_description || item[`${langName.toLowerCase()}_description`] || '';
            const category = item.category || item.translated_category || item[`${langName.toLowerCase()}_category`] || '';

            return {
                id: itemId,
                name,
                description,
                category
            };
        }).filter(Boolean);

        console.log(`[GROQ] Successfully parsed and normalized ${normalizedList.length} product translations for '${targetLang}'.`);
        return normalizedList;
    } catch (err) {
        console.error('[GROQ] Failed to translate products:', err.message);
        return [];
    }
}

/**
 * Cache and fetch translated products from database or Groq AI.
 */
export async function getTranslatedProducts(db, products, lang) {
    if (!lang || lang === 'en' || !Array.isArray(products) || products.length === 0) {
        return products;
    }

    return new Promise((resolve) => {
        db.all(
            "SELECT product_id, lang, name, description, category FROM product_translations WHERE lang = ?",
            [lang],
            async (err, cachedRows) => {
                const cachedMap = new Map();
                if (!err && Array.isArray(cachedRows)) {
                    cachedRows.forEach(row => cachedMap.set(String(row.product_id), row));
                }

                const missingProducts = products.filter(p => !cachedMap.has(String(p.id)));

                if (missingProducts.length > 0) {
                    console.log(`[GROQ] Found ${missingProducts.length} missing product translations for '${lang}'. Requesting Groq AI...`);
                    const newTranslations = await translateProductsWithGroq(missingProducts, lang);

                    newTranslations.forEach(tItem => {
                        if (tItem && tItem.id) {
                            const strId = String(tItem.id);
                            cachedMap.set(strId, {
                                product_id: strId,
                                lang: lang,
                                name: tItem.name,
                                description: tItem.description,
                                category: tItem.category
                            });

                            // Save to DB cache asynchronously
                            db.run(
                                `INSERT INTO product_translations (product_id, lang, name, description, category) 
                                 VALUES (?, ?, ?, ?, ?) 
                                 ON CONFLICT(product_id, lang) DO UPDATE SET 
                                 name=excluded.name, description=excluded.description, category=excluded.category`,
                                [strId, lang, tItem.name || '', tItem.description || '', tItem.category || ''],
                                (insErr) => {
                                    if (insErr) {
                                        // SQLite fallback syntax if ON CONFLICT failed
                                        db.run(
                                            `INSERT OR REPLACE INTO product_translations (product_id, lang, name, description, category) VALUES (?, ?, ?, ?, ?)`,
                                            [strId, lang, tItem.name || '', tItem.description || '', tItem.category || '']
                                        );
                                    }
                                }
                            );
                        }
                    });
                }

                // Construct final array preserving original product metadata
                const result = products.map(p => {
                    const trans = cachedMap.get(String(p.id));
                    if (trans) {
                        return {
                            ...p,
                            name: trans.name || p.name,
                            description: trans.description || p.description,
                            category: trans.category || p.category
                        };
                    }
                    return p;
                });

                resolve(result);
            }
        );
    });
}
