import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const combinedMap = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/utils/hindi_bengali_products_map.json'), 'utf-8'));
const translationsFilePath = path.join(__dirname, '../src/utils/translations.js');

let translationsContent = fs.readFileSync(translationsFilePath, 'utf-8');

const newProductTranslations = {};

Object.keys(combinedMap).forEach(id => {
    const item = combinedMap[id];
    newProductTranslations[id] = {
        name: { 
            hi: item.hiName,
            bn: item.bnName
        },
    };
});

const dictString = `export const productTranslations = ${JSON.stringify(newProductTranslations, null, 4)};`;

translationsContent = translationsContent.replace(
    /export const productTranslations = \{[\s\S]*?\};/,
    dictString
);

fs.writeFileSync(translationsFilePath, translationsContent);
console.log('Successfully injected 389 Hindi AND 389 Bengali product translations into src/utils/translations.js!');
