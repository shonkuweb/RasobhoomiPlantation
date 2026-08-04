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
        id: p.id,
        name: p.name || '',
        description: p.description || '',
        category: p.category || ''
    }));

    const systemPrompt = `You are a professional botanical and horticultural translator for an Indian plant nursery. 
Translate the provided plant products into fluent, natural ${langName}.
Maintain accuracy for plant varieties, fruits, and farming terms.
You MUST output valid JSON ONLY with key "translations" containing an array of objects:
[
  {
    "id": "product_id",
    "name": "translated name in ${langName}",
    "description": "translated description in ${langName}",
    "category": "translated category in ${langName}"
  }
]`;

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
                temperature: 0.2,
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

        const parsed = JSON.parse(rawContent);
        const resultList = Array.isArray(parsed) ? parsed : (parsed.translations || parsed.items || []);
        console.log(`[GROQ] Successfully translated ${resultList.length} products to ${langName}.`);
        return resultList;
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
                    cachedRows.forEach(row => cachedMap.set(row.product_id, row));
                }

                const missingProducts = products.filter(p => !cachedMap.has(p.id));

                if (missingProducts.length > 0) {
                    console.log(`[GROQ] Found ${missingProducts.length} missing product translations for '${lang}'. Requesting Groq AI...`);
                    const newTranslations = await translateProductsWithGroq(missingProducts, lang);

                    newTranslations.forEach(tItem => {
                        if (tItem && tItem.id) {
                            cachedMap.set(tItem.id, {
                                product_id: tItem.id,
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
                                [tItem.id, lang, tItem.name || '', tItem.description || '', tItem.category || ''],
                                (insErr) => {
                                    if (insErr) {
                                        // SQLite fallback syntax if ON CONFLICT failed
                                        db.run(
                                            `INSERT OR REPLACE INTO product_translations (product_id, lang, name, description, category) VALUES (?, ?, ?, ?, ?)`,
                                            [tItem.id, lang, tItem.name || '', tItem.description || '', tItem.category || '']
                                        );
                                    }
                                }
                            );
                        }
                    });
                }

                // Construct final array preserving original product metadata
                const result = products.map(p => {
                    const trans = cachedMap.get(p.id);
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
