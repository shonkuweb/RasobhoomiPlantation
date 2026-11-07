import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WhatsAppOutbox } from '../backend/whatsapp_outbox.js';

const sourceUrl = new URL('../backend/whatsapp.js', import.meta.url);
const source = fs.readFileSync(sourceUrl, 'utf8');
const customer = '919000000001@c.us';
const admin = '919000000002@c.us';
const order = { id: 'TEST_ONLY', name: 'Test', phone: '9000000001', items: '[]', total: 100, payment_status: 'paid' };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, { initialize, destroy, browserModules, initialUtils, send, invoice } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-integration-test-'));
    const clients = [], queues = [], calls = [], timers = new Map(), authDeletes = [];
    let timerId = 0;
    const browser = vm.createContext({ window: { WWebJS: initialUtils, require(name) {
        if (!browserModules?.[name]) throw new Error('Missing module: ' + name);
        return browserModules[name];
    }}, setTimeout, clearTimeout });
    class Client extends EventEmitter {
        constructor() {
            super();
            clients.push(this);
            this.pupBrowser = {};
            this.info = { wid: { _serialized: admin, user: '919000000002' } };
            this.pupPage = { evaluate: async (fn, ...args) => {
                if (args.length === 1 && Array.isArray(args[0])) return [];
                if (args.length && send) {
                    calls.push(args);
                    return send(...args);
                }
                browser.args = args;
                return vm.runInContext(`(${fn.toString()})(...args)`, browser);
            }};
        }
        async initialize() { return initialize?.(this); }
        async destroy() { return destroy?.(this); }
        async logout() {}
        async getNumberId(number) { return { _serialized: number + '@c.us' }; }
        async sendMessage() { throw new Error('Second dispatcher must never run'); }
    }
    class Outbox extends WhatsAppOutbox {
        constructor(options) { super(options); queues.push(this); }
        start() {} // Explicit flushes make timing deterministic.
        kick() {}
    }
    const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Buffer,
        process: { env: { ADMIN_WHATSAPP: '9000000002', WHATSAPP_OUTBOX_DIR: dir } },
        setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); if (ms === 1200) Promise.resolve().then(() => { if (timers.delete(id)) fn(); }); return id; },
        clearTimeout: id => timers.delete(id)
    });
    const dependencies = {
        '../scripts/patch_wwebjs.js': {},
        'dotenv': { default: { config() {} } },
        'node:crypto': crypto,
        './whatsapp_outbox.js': { WhatsAppOutbox: Outbox },
        'whatsapp-web.js': { default: { Client, LocalAuth: class {}, MessageMedia: class {
            constructor(mimetype, data, filename, filesize) { Object.assign(this, { mimetype, data, filename, filesize }); }
        }}},
        'qrcode': { default: { toDataURL: async () => 'data:mock-qr' } },
        'fs': { default: { existsSync: () => false, mkdirSync() {}, readdirSync: () => [], rmSync: p => authDeletes.push(p) } },
        'path': { default: path }, 'url': url,
        './invoice_generator.js': { generateInvoicePdf: invoice || (async () => Buffer.from('mock-pdf')) },
        './product_translator.js': { translateProduct: value => value }
    };
    const module = new vm.SourceTextModule(source, {
        context, identifier: sourceUrl.href,
        initializeImportMeta(meta) { meta.url = sourceUrl.href; }
    });
    await module.link(specifier => {
        assert.ok(specifier in dependencies, 'Unexpected import: ' + specifier);
        const values = dependencies[specifier];
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [name, value] of Object.entries(values)) this.setExport(name, value);
        }, { context });
    });
    await module.evaluate();
    t.after(() => {
        for (const queue of queues) queue.stop();
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const api = module.namespace;
    async function connect() {
        api.initWhatsApp();
        clients.at(-1).emit('ready');
        await settle();
    }
    return { api, connect, clients, queues, calls, timers, browser, authDeletes, dir };
}

test('empty send result is failure; test alerts and recovery cannot claim success', async t => {
    const f = await fixture(t, { send: async () => undefined });
    await f.connect();
    await assert.rejects(f.api.sendTestMessage('9000000001'), /Unknown browser evaluation error/);
    const recovery = await f.api.sendPaymentRecoveryWhatsApp({ ...order, payment_status: 'pending', status: 'pending_payment' }, 1);
    assert.equal(recovery.success, false);
});

test('customer failure does not prevent admin delivery; retry skips sent text and PDFs', async t => {
    let failCustomer = true;
    const f = await fixture(t, { send: async (jid, text, media, opts) => {
        if (jid === customer && failCustomer) return { success: false, error: 'customer unavailable' };
        return { success: true, messageId: opts.messageId, to: jid };
    }});
    await f.connect();
    assert.equal((await f.api.sendOrderPaymentNotification(order)).queued, true);
    await f.queues[0].flush();
    assert.equal(f.api.getWhatsAppStatus().pendingNotifications, 1);
    assert.equal(f.calls.filter(([jid]) => jid === admin).length, 2);
    failCustomer = false;
    await f.queues[0].flush(true);
    assert.equal(f.calls.filter(([jid]) => jid === admin).length, 2);
    assert.equal(f.api.getWhatsAppStatus().pendingNotifications, 0);
    assert.equal((await f.api.sendOrderPaymentNotification(order)).duplicate, true);
    assert.equal(f.calls[0][3].messageId, f.calls[3][3].messageId);
});

test('failed PDF retries without repeating text', async t => {
    let failPdf = true;
    const f = await fixture(t, { send: async (jid, text, media, opts) => {
        if (media && failPdf) return { success: false, error: 'upload failed' };
        return { success: true, messageId: opts.messageId, to: jid };
    }});
    await f.connect();
    await f.api.sendOrderPaymentNotification(order);
    await f.queues[0].flush();
    failPdf = false;
    await f.queues[0].flush(true);
    assert.equal(f.calls.filter(([, , media]) => !media).length, 2);
    assert.equal(f.calls.filter(([, , media]) => media).length, 4);
    assert.equal(f.api.getWhatsAppStatus().pendingNotifications, 0);
});

test('orders placed offline are persisted and dispatched after ready', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: opts.messageId, to: jid }) });
    await f.api.sendPendingPaymentNotification({ ...order, payment_status: 'pending' });
    await f.queues[0].flush();
    assert.equal(f.calls.length, 0);
    assert.ok(fs.existsSync(path.join(f.dir, 'notifications.json')));
    await f.connect();
    await f.queues[0].flush(true);
    assert.equal(f.calls.length, 4);
});

test('paid notification cancels an unsent pending notification', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: opts.messageId, to: jid }) });
    await f.api.sendPendingPaymentNotification(order);
    await f.api.sendOrderPaymentNotification(order);
    assert.equal((await f.api.sendPendingPaymentNotification(order)).skipped, true);
    await f.connect();
    await f.queues[0].flush(true);
    assert.equal(f.calls.length, 4);
});

test('new status supersedes an obsolete unsent status', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: opts.messageId, to: jid }) });
    await f.api.sendOrderStatusNotification(order, 'in-transit');
    await f.api.sendOrderStatusNotification(order, 'completed');
    await f.connect();
    await f.queues[0].flush(true);
    assert.equal(f.calls.length, 2);
});

test('authenticated state retains a watchdog and restarts if ready never arrives', async t => {
    const f = await fixture(t);
    f.api.initWhatsApp();
    f.clients[0].emit('authenticated');
    assert.equal(f.api.getWhatsAppStatus().status, 'AUTHENTICATED');
    const watchdog = [...f.timers.values()].find(timer => timer.ms === 120000);
    assert.ok(watchdog);
    watchdog.fn();
    const retry = [...f.timers.values()].find(timer => timer.ms === 5000);
    assert.ok(retry);
    retry.fn();
    await settle();
    assert.equal(f.clients.length, 2);
});

test('generic browser startup failure schedules a restart', async t => {
    const f = await fixture(t, { initialize: async instance => { instance.pupBrowser = null; throw new Error('launch failed'); }, destroy: async () => { throw new Error('No browser to destroy'); } });
    f.api.initWhatsApp();
    await settle();
    assert.equal(f.api.getWhatsAppStatus().status, 'DISCONNECTED');
    const retry = [...f.timers.values()].find(timer => timer.ms === 5000);
    assert.ok(retry);
    retry.fn();
    await settle();
    assert.equal(f.clients.length, 2);
});

test('reconnect waits for browser shutdown; stale events cannot disconnect its replacement', async t => {
    let finish;
    const f = await fixture(t, { destroy: () => new Promise(resolve => { finish = resolve; }) });
    await f.connect();
    const old = f.clients[0];
    const reconnect = f.api.reconnectWhatsApp();
    const concurrent = f.api.reconnectWhatsApp();
    assert.equal(f.clients.length, 1);
    finish();
    const results = await Promise.all([reconnect, concurrent]);
    assert.ok(results.every(result => result?.status));
    assert.equal(f.clients.length, 2);
    f.clients[1].emit('ready');
    await settle();
    old.emit('disconnected', 'late old event');
    assert.equal(f.api.getWhatsAppStatus().status, 'CONNECTED');
    assert.equal(f.authDeletes.length, 0);
});

test('media patch waits for WWebJS injection and strips unsafe serialized IDs', async t => {
    const f = await fixture(t);
    await f.connect();
    assert.equal(f.browser.window._wwebjs_media_patch_installed, undefined);
    const utils = { processMediaData: async () => ({ id: 'bad', toJSON: () => ({ id: 'also-bad', directPath: '/media' }) }), getChat: async () => null };
    f.browser.window.WWebJS = utils;
    await f.api.ensureMediaPatchApplied();
    const result = await utils.processMediaData();
    assert.equal(result.id, 'bad'); // preserve the model ID required by its own getters
    assert.equal(result.toJSON().id, undefined);
    assert.equal(result.toJSON().directPath, '/media');
});

function browserFixture({ failSend = false, noChat = false, noMedia = false, lid = false, existingAck = null, sendGate } = {}) {
    const messages = [];
    const wid = id => ({ _serialized: id, isLid: () => id.endsWith('@lid') });
    const chat = noChat ? null : { id: wid(lid ? '12345@lid' : customer) };
    class MsgKey {
        static async newId() { return 'NEW-ID'; }
        constructor({ to, id }) { this._serialized = `${to._serialized}_${id}`; }
    }
    const modules = {
        WAWebWidFactory: { createWid: wid },
        WAWebCollections: { Chat: { get: () => chat, find: async () => chat }, Msg: { get: () => existingAck === null ? null : { ack: existingAck } } },
        WAWebQueryExistsJob: { queryWidExists: async raw => ({ wid: chat?.id || raw }) },
        WAWebFindChatAction: { findOrCreateLatestChat: async () => ({ chat }) },
        WAWebSendMsgChatAction: { addAndSendMsgToChat: (target, message) => {
            messages.push(message);
            return [Promise.resolve(), sendGate || (failSend ? Promise.reject(new Error('server rejected')) : Promise.resolve())];
        }},
        WAWebUserPrefsMeUser: { getMaybeMeLidUser: () => wid('self@lid'), getMaybeMePnUser: () => wid(admin) },
        WAWebMsgKey: MsgKey,
        WAWebGetEphemeralFieldsMsgActionsUtils: { getEphemeralFields: () => ({}) }
    };
    const initialUtils = { getChat: async () => chat };
    if (!noMedia) initialUtils.processMediaData = async () => ({
        id: 'bad-id', toJSON: () => ({ id: 'bad-json-id', type: 'document', directPath: '/encrypted/upload' })
    });
    return { browserModules: modules, initialUtils, messages };
}

test('custom dispatcher waits for server send confirmation, not only local message creation', async t => {
    let confirm;
    const b = browserFixture({ sendGate: new Promise(resolve => { confirm = resolve; }) });
    const f = await fixture(t, b);
    await f.connect();
    let finished = false;
    const sending = f.api.safeSendMessage(customer, 'test').then(result => { finished = true; return result; });
    await settle();
    assert.equal(finished, false);
    confirm();
    assert.equal((await sending).success, true);
});

test('server rejection is a failure and never invokes a duplicate fallback sender', async t => {
    const b = browserFixture({ failSend: true });
    const f = await fixture(t, b);
    await f.connect();
    await assert.rejects(f.api.safeSendMessage(customer, 'test'), /server rejected/);
    assert.equal(b.messages.length, 1);
});

test('missing chat is a failure instead of constructing a fake chat', async t => {
    const b = browserFixture({ noChat: true });
    const f = await fixture(t, b);
    await f.connect();
    await assert.rejects(f.api.safeSendMessage(customer, 'test'), /Could not initialize chat/);
    assert.equal(b.messages.length, 0);
});

test('LID documents preserve media attributes and valid persisted message keys', async t => {
    const b = browserFixture({ lid: true });
    const f = await fixture(t, b);
    await f.connect();
    assert.equal(await f.api.sendPdfDocumentSafe('12345@lid', Buffer.from('pdf'), 'order', 'STABLE-ID'), true);
    assert.equal(b.messages[0].directPath, '/encrypted/upload');
    assert.equal(b.messages[0].id._serialized, '12345@lid_STABLE-ID');
    assert.equal(b.messages[0].type, 'document');
    assert.equal(b.messages[0].from._serialized, 'self@lid');
});

test('missing media processor cannot send an empty substitute for a PDF', async t => {
    const b = browserFixture({ noMedia: true });
    const f = await fixture(t, b);
    await f.connect();
    assert.equal(await f.api.sendPdfDocumentSafe(customer, Buffer.from('pdf'), 'order'), false);
    assert.equal(b.messages.length, 0);
});

test('already acknowledged message key is not dispatched again after retry', async t => {
    const b = browserFixture({ existingAck: 1 });
    const f = await fixture(t, b);
    await f.connect();
    const result = await f.api.safeSendMessage(customer, 'test', { messageId: 'PERSISTED-ID' });
    assert.equal(result.success, true);
    assert.equal(b.messages.length, 0);
});

test('send timeout remains a failure and never starts a second dispatcher', async t => {
    const f = await fixture(t, { send: async () => new Promise(() => {}) });
    await f.connect();
    const sending = f.api.safeSendMessage(customer, 'test');
    await settle();
    const timeout = [...f.timers.values()].find(timer => timer.ms === 60000);
    assert.ok(timeout);
    timeout.fn();
    await assert.rejects(sending, /timed out/);
    assert.equal(f.calls.length, 1);
});

test('manual invoice reports failure when text succeeds but PDF upload fails', async t => {
    const f = await fixture(t, { send: async (jid, text, media) => media
        ? { success: false, error: 'upload rejected' }
        : { success: true, messageId: 'TEXT-ONLY', to: jid }
    });
    await f.connect();
    let finished = false;
    const sending = f.api.sendDirectInvoicePdf(order, '9000000001').then(result => { finished = true; return result; });
    for (let i = 0; i < 10 && !finished; i++) {
        await settle();
        for (const [id, timer] of f.timers) {
            if (timer.ms === 1200) { f.timers.delete(id); timer.fn(); }
        }
    }
    const result = await sending;
    assert.equal(result.success, false);
    assert.equal(result.pdfSentCount, 0);
    assert.equal(result.sentCount, 1);
});

test('unregistered number is rejected instead of routing to a guessed phone JID', async t => {
    const f = await fixture(t);
    await f.connect();
    f.clients[0].getNumberId = async () => null;
    await assert.rejects(f.api.resolveWhatsAppJid('9000000001'), /not registered/);
});

test('recovery retry retains its message ID and does not run for paid orders', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: opts.messageId, to: jid }) });
    await f.connect();
    assert.equal((await f.api.sendPaymentRecoveryWhatsApp(order, 1)).skipped, true);
    assert.equal(f.calls.length, 0);
    const pending = { ...order, payment_status: 'pending', status: 'pending_payment' };
    await f.api.sendPaymentRecoveryWhatsApp(pending, 1);
    await f.api.sendPaymentRecoveryWhatsApp(pending, 1);
    await f.api.sendPaymentRecoveryWhatsApp(pending, 2);
    assert.equal(f.calls[0][3].messageId, f.calls[1][3].messageId);
    assert.notEqual(f.calls[1][3].messageId, f.calls[2][3].messageId);
});

test('accepted is not delivered: only recipient ACKs complete delivery receipts', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: `${jid}_${opts.messageId}`, to: jid, ack: 1 }) });
    await f.connect();
    await f.api.sendOrderPaymentNotification(order);
    await f.queues[0].flush();
    assert.equal(f.api.getWhatsAppStatus().pendingNotifications, 0);
    assert.equal(f.api.getWhatsAppStatus().awaitingDelivery, 1);
    const ids = f.queues[0].jobs.get(`paid:${order.id}`).targets.flatMap(target => [target.textMessageId, target.pdfMessageId]);
    for (const id of ids) f.clients[0].emit('message_ack', { id: { _serialized: id } }, 1);
    assert.equal(f.api.getWhatsAppStatus().awaitingDelivery, 1);
    await f.queues[0].flush(true);
    assert.equal(f.calls.length, 4, 'offline recipients must not receive duplicate messages');
    for (const id of ids) f.clients[0].emit('message_ack', { id: { _serialized: id } }, 2);
    assert.equal(f.api.getWhatsAppStatus().awaitingDelivery, 0);
    const receipt = f.queues[0].jobs.get(`paid:${order.id}`);
    assert.ok(receipt.deliveredAt);
    assert.equal(receipt.order, undefined);
});

test('late WhatsApp error ACK retries only the rejected message', async t => {
    const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: `${jid}_${opts.messageId}`, to: jid, ack: 1 }) });
    await f.connect();
    await f.api.sendOrderPaymentNotification(order);
    await f.queues[0].flush();
    const target = f.queues[0].jobs.get(`paid:${order.id}`).targets[0];
    f.clients[0].emit('message_ack', { id: { _serialized: target.pdfMessageId } }, -1);
    assert.equal(f.api.getWhatsAppStatus().pendingNotifications, 1);
    await f.queues[0].flush(true);
    assert.equal(f.calls.length, 5);
    assert.equal(f.calls[4][0], customer);
    assert.ok(f.calls[4][2]);
});

for (const kind of ['paid', 'pending']) {
    test(`${kind} order uses the existing customer/admin message builders and includes both PDFs`, async t => {
        const f = await fixture(t, { send: async (jid, text, media, opts) => ({ success: true, messageId: opts.messageId, to: jid, ack: 2 }) });
        await f.connect();
        if (kind === 'paid') await f.api.sendOrderPaymentNotification(order);
        else await f.api.sendPendingPaymentNotification(order);
        await f.queues[0].flush();
        const customerText = f.calls.find(([jid, text, media]) => jid === customer && !media)[1];
        const adminText = f.calls.find(([jid, text, media]) => jid === admin && !media)[1];
        assert.equal(customerText, kind === 'paid' ? f.api.buildCustomerOrderMessage(order) : f.api.buildCustomerPendingOrderMessage(order));
        assert.equal(adminText, kind === 'paid' ? f.api.buildOrderNotificationMessage(order) : f.api.buildPendingPaymentNotificationMessage(order));
        assert.equal(f.calls.filter(([, , media]) => media).length, 2);
    });
}
