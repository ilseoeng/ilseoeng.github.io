import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const js = readFileSync(new URL('./recharge.js', import.meta.url), 'utf8');
const { installRecharge } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

function setup() {
    const elements = {};
    const get = id => elements[id] ||= { value: '', textContent: '', style: {}, listeners: {},
        addEventListener(event, callback) { this.listeners[event] = callback; }, scrollIntoView() {} };
    const calls = [], checkouts = [], buttons = [{ disabled: false }], timers = [];
    let clock = 1000;
    let responder = async () => ({ ok: true, json: async () => ({ status: 'success', ticket: 'signed-ticket-A', serialCode: 'abc 123', expiresAt: 1801 }) });
    const win = { currentLang: 'ko', setTimeout: f => timers.push(f), grecaptcha: { getResponse: () => 'captcha', reset() {} } };
    const api = installRecharge({ win, doc: { getElementById: get, querySelectorAll: () => buttons },
        send: (...args) => { calls.push(args); return responder(...args); },
        paddle: { Checkout: { open: data => checkouts.push(data) } }, now: () => clock });
    const edit = (id, value) => { get(id).value = value; get(id).listeners.input(); };
    return { win, api, get, edit, calls, checkouts, buttons, timers,
        respond: value => responder = value, tick: value => clock = value };
}

async function verified() { const s = setup(); await s.api.start({ ticket: 'signed-ticket-A' }); return s; }

test('app ticket is verified by server and raw code never selects checkout device', async () => {
    const s = await verified();
    assert.equal(await s.win.pay('30min'), true);
    assert.deepEqual(s.checkouts[0].customData, { checkout_ticket: 'signed-ticket-A' });
    assert.equal(s.checkouts[0].items[0].quantity, 1);
    assert.equal(s.checkouts[0].items[0].priceId, 'pri_01kdze89gfya79z9rjwmxswhat');
});
test('editing code or password invalidates previously authorized checkout', async () => {
    for (const id of ['remoteCode', 'password']) {
        const s = await verified(); s.edit(id, 'another-device');
        assert.equal(await s.win.pay('1hour'), false);
        assert.equal(s.checkouts.length, 0);
        assert.equal(s.get('recaptcha-box').style.display, '');
    }
});
test('failed re-verification cannot preserve prior authorization', async () => {
    const s = await verified(); s.edit('password', 'wrong');
    s.respond(async () => ({ ok: false, json: async () => ({ status: 'error' }) }));
    await s.win.verifyDevice(); await s.win.pay('30min');
    assert.equal(s.checkouts.length, 0);
});
test('a late authentication response cannot authorize a changed device', async () => {
    const s = setup(); s.edit('remoteCode', 'abc 123'); s.edit('password', 'password');
    let finish;
    s.respond(() => new Promise(resolve => finish = resolve));
    const pending = s.win.verifyDevice(); s.edit('remoteCode', 'def 456');
    finish({ ok: true, json: async () => ({ status: 'success', ticket: 'old-ticket', serialCode: 'abc 123', expiresAt: 1801 }) });
    await pending; await s.win.pay('30min'); assert.equal(s.checkouts.length, 0);
});
test('a late pay validation cannot charge after credentials change', async () => {
    const s = await verified(); let finish;
    s.respond(() => new Promise(resolve => finish = resolve));
    const pending = s.win.pay('30min'); s.edit('remoteCode', 'def 456');
    finish({ ok: true, json: async () => ({ status: 'success', ticket: 'signed-ticket-A', serialCode: 'abc 123', expiresAt: 1801 }) });
    await pending; assert.equal(s.checkouts.length, 0);
});
test('expired ticket and double clicks cannot start checkout', async () => {
    const s = await verified(); await Promise.all([s.win.pay('30min'), s.win.pay('30min')]);
    assert.equal(s.checkouts.length, 1);
    s.win.rechargeCheckoutEvent('checkout.closed'); s.tick(1801000);
    assert.equal(await s.win.pay('30min'), false); assert.equal(s.checkouts.length, 1);
});
test('network failure before checkout fails closed', async () => {
    const s = await verified(); s.respond(async () => { throw new Error('offline'); });
    assert.equal(await s.win.pay('30min'), false); assert.equal(s.checkouts.length, 0);
});
test('manual verification sends credentials only in HTTPS body and clears password', async () => {
    const s = setup(); s.edit('remoteCode', 'ABC123'); s.edit('password', 'private-password');
    assert.equal(await s.win.verifyDevice(), true);
    const [url, request] = s.calls[0]; assert.equal(url.startsWith('https://'), true);
    assert.equal(url.includes('private-password'), false);
    assert.deepEqual(JSON.parse(request.body), { serialCode: 'abc 123', password: 'private-password', recaptcha: 'captcha' });
    assert.equal(s.get('password').value, '');
});
test('all six price choices keep expected localization mapping', async () => {
    const expected = { ko: ['pri_01kdze89gfya79z9rjwmxswhat', 'pri_01kdzecpcresbd5dx14bk69a49', 'pri_01kdzef4qmyzdykd61m332g414'],
        en: ['pri_01khhpbh3er2aqj2qbh4y04w7h', 'pri_01khhpay2arxw9jtes10e45tdx', 'pri_01khhp8kd7rfft8fczav8341yn'] };
    for (const language of ['ko', 'en']) for (const [index, plan] of ['30min', '1hour', '3hours'].entries()) {
        const s = await verified(); s.win.currentLang = language; await s.win.pay(plan);
        assert.equal(s.checkouts[0].items[0].priceId, expected[language][index]);
    }
});
