import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const BATCH_SIZE = 10; // 10 items per batch (~1,000 tokens) to safely stay within rate limits

/**
 * Call Groq API for a single chunk/batch of products with automatic 429 retry backoff.
 */
async function translateBatchWithGroq(productsChunk, targetLang, apiKey, maxRetries = 3) {
    const langName = targetLang === 'hi' ? 'Hindi' : 'Bengali';
    const payloadItems = productsChunk.map(p => ({
        id: String(p.id),
        name: p.name || '',
        description: (p.description || '').substring(0, 250),
        category: p.category || ''
    }));

    const systemPrompt = `You are a professional botanical and horticultural translator for an Indian plant nursery. 
Translate the provided plant products completely into fluent, natural ${langName}.
CRITICAL INSTRUCTIONS:
1. Translate the FULL product name and description into ${langName} script (${langName === 'Hindi' ? 'Devanagari' : 'Bengali script'}).
2. Do NOT leave any English words in the product name or description. Transliterate proper names, variety titles, and brand terms phonetically into ${langName} script (e.g. "Amrapali" -> "${langName === 'Hindi' ? 'अमरापाली' : 'আম্রপালী'}", "Kolkata Pati" -> "${langName === 'Hindi' ? 'कोलकाता पाती' : 'কলকাতা পাতি'}", "Hybrid" -> "${langName === 'Hindi' ? 'हाइब्रिड' : 'হাইব্রিড'}", "Grafted" -> "${langName === 'Hindi' ? 'कलमी' : 'কলমি'}").
3. Output valid JSON ONLY with key "translations":
{
  "translations": [
    {
      "id": "exact_product_id",
      "name": "full translated plant name in ${langName}",
      "description": "full translated description in ${langName}",
      "category": "translated category in ${langName}"
    }
  ]
}`;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
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
                if (response.status === 429 && attempt < maxRetries) {
                    const match = errText.match(/try again in ([0-9.]+)s/i);
                    const waitSec = match ? Math.ceil(parseFloat(match[1])) + 1 : 10;
                    console.warn(`[GROQ] Rate limit hit (429). Retrying batch in ${waitSec} seconds (Attempt ${attempt}/${maxRetries})...`);
                    await new Promise(res => setTimeout(res, waitSec * 1000));
                    continue;
                }
                console.error(`[GROQ] Batch API Error (${response.status}):`, errText);
                return [];
            }

            const data = await response.json();
            const rawContent = data.choices?.[0]?.message?.content;
            if (!rawContent) return [];

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

            return rawList.map(item => {
                if (!item) return null;
                const itemId = String(item.id || item.productId || item.product_id || '');
                if (!itemId) return null;

                const name = item.name || item.translated_name || item[`${langName.toLowerCase()}_name`] || item.title || '';
                const description = item.description || item.translated_description || item[`${langName.toLowerCase()}_description`] || '';
                const category = item.category || item.translated_category || item[`${langName.toLowerCase()}_category`] || '';

                return { id: itemId, name, description, category };
            }).filter(Boolean);
        } catch (err) {
            console.error(`[GROQ] Batch translation exception on attempt ${attempt}:`, err.message);
            if (attempt < maxRetries) {
                await new Promise(res => setTimeout(res, 3000));
            }
        }
    }

    return [];
}

/**
 * Call Groq API in batched chunks with rate-limiting pauses to translate products safely.
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
    console.log(`[GROQ] Starting batched full translation of ${products.length} products to ${langName} (batch size: ${BATCH_SIZE})...`);

    const allResults = [];
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const chunk = products.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(products.length / BATCH_SIZE);
        console.log(`[GROQ] Translating batch ${batchNum}/${totalBatches} (${chunk.length} items)...`);

        const chunkResults = await translateBatchWithGroq(chunk, targetLang, apiKey);
        allResults.push(...chunkResults);

        if (i + BATCH_SIZE < products.length) {
            await new Promise(res => setTimeout(res, 2500));
        }
    }

    console.log(`[GROQ] Batched full translation complete. Successfully translated ${allResults.length}/${products.length} products for '${targetLang}'.`);
    return allResults;
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
                    console.log(`[GROQ] Found ${missingProducts.length} missing product translations for '${lang}'. Starting batch AI translation...`);
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

                            // Save to DB cache
                            db.run(
                                `INSERT INTO product_translations (product_id, lang, name, description, category) 
                                 VALUES (?, ?, ?, ?, ?) 
                                 ON CONFLICT(product_id, lang) DO UPDATE SET 
                                 name=excluded.name, description=excluded.description, category=excluded.category`,
                                [strId, lang, tItem.name || '', tItem.description || '', tItem.category || ''],
                                (insErr) => {
                                    if (insErr) {
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
