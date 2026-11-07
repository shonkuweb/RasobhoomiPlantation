import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const utilsPath = path.join(__dirname, '../node_modules/whatsapp-web.js/src/util/Injected/Utils.js');

try {
    if (fs.existsSync(utilsPath)) {
        let content = fs.readFileSync(utilsPath, 'utf8');
        let modified = false;

        // Fix 1: ensure message.id is not overwritten by mediaOptions and delete __x_id
        if (!content.includes('delete message.__x_id')) {
            console.log('[PATCH] Patching whatsapp-web.js Injected/Utils.js for media memoize getter issue...');
            const target = '...extraOptions,\n        };';
            const replacement = '...extraOptions,\n        };\n        delete message.__x_id;\n        message.id = newMsgKey;';
            
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
                console.log('[PATCH] ✅ Successfully patched Injected/Utils.js media memoize!');
            } else {
                console.warn('[PATCH] Target anchor not found in Utils.js. Will rely on runtime Puppeteer patch.');
            }
        }

        // Fix 2: Wait briefly for Msg.get so sendMessage does not resolve to undefined
        if (!content.includes('waitForSentMsg')) {
            const target2 = `return window\n            .require('WAWebCollections')\n            .Msg.get(newMsgKey._serialized);`;
            const replacement2 = `let _sentMsg = window.require('WAWebCollections').Msg.get(newMsgKey._serialized);\n        if (!_sentMsg) {\n            for (let i = 0; i < 5; i++) {\n                await new Promise(r => setTimeout(r, 100));\n                _sentMsg = window.require('WAWebCollections').Msg.get(newMsgKey._serialized);\n                if (_sentMsg) break;\n            }\n        }\n        return _sentMsg || (window.require('WAWebCollections').Msg.modelClass ? new (window.require('WAWebCollections').Msg.modelClass)(message) : null); // waitForSentMsg`;
            if (content.includes(target2)) {
                content = content.replace(target2, replacement2);
                modified = true;
                console.log('[PATCH] ✅ Successfully patched Injected/Utils.js with Msg.get retry!');
            }
        }

        if (modified) {
            fs.writeFileSync(utilsPath, content, 'utf8');
        } else {
            console.log('[PATCH] whatsapp-web.js already patched.');
        }
    } else {
        console.log('[PATCH] whatsapp-web.js not found in node_modules (may be skipped in this environment).');
    }
} catch (err) {
    console.warn('[PATCH] Notice while applying patch:', err.message);
}
