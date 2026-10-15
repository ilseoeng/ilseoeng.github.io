// Authentication and checkout are bound by a server-signed, expiring device ticket.
export function installRecharge({ win = window, doc = document, send = win.fetch.bind(win),
    paddle = win.Paddle, now = () => Date.now(),
    endpoint = 'https://relay.nandagom.co.kr/api/checkout-session' } = {}) {
    let auth = null;
    let generation = 0;
    let checking = false;
    let checkoutOpen = false;
    const code = doc.getElementById('remoteCode');
    const password = doc.getElementById('password');
    const status = doc.getElementById('statusMsg');
    const plans = {
        ko: { '30min': 'pri_01kdze89gfya79z9rjwmxswhat', '1hour': 'pri_01kdzecpcresbd5dx14bk69a49', '3hours': 'pri_01kdzef4qmyzdykd61m332g414' },
        en: { '30min': 'pri_01khhpbh3er2aqj2qbh4y04w7h', '1hour': 'pri_01khhpay2arxw9jtes10e45tdx', '3hours': 'pri_01khhp8kd7rfft8fczav8341yn' }
    };
    const lang = () => win.currentLang === 'ko' ? 'ko' : 'en';
    const message = (ko, en) => { status.textContent = lang() === 'ko' ? ko : en; };
    const normalize = value => {
        const clean = value.trim().toLowerCase();
        return clean.length === 6 && !clean.includes(' ') ? clean.slice(0, 3) + ' ' + clean.slice(3) : clean;
    };
    const valid = () => auth && auth.expiresAt * 1000 > now()
        && auth.code === normalize(code.value) && auth.password === password.value;
    const buttons = () => {
        doc.querySelectorAll('button[onclick^="pay("]').forEach(button => {
            button.disabled = !valid() || checking || checkoutOpen;
        });
    };
    const invalidate = () => {
        auth = null;
        generation++;
        doc.getElementById('recaptcha-box').style.display = '';
        buttons();
        message('기기 인증 후 이용권을 선택해 주세요.', 'Verify your device before selecting a plan.');
    };
    code.addEventListener('input', invalidate);
    password.addEventListener('input', invalidate);

    async function request(payload) {
        const response = await send(endpoint, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
            credentials: 'omit', cache: 'no-store', redirect: 'error' });
        const data = await response.json();
        if (!response.ok || data.status !== 'success' || typeof data.ticket !== 'string'
            || !Number.isSafeInteger(data.expiresAt) || data.expiresAt * 1000 <= now()
            || typeof data.serialCode !== 'string') throw new Error('Verification failed');
        return data;
    }

    async function verify(ticket) {
        invalidate();
        const revision = generation;
        const enteredCode = code.value;
        const enteredPassword = password.value;
        checking = true;
        buttons();
        try {
            let payload;
            if (ticket) {
                payload = { ticket };
            } else {
                const captcha = win.grecaptcha?.getResponse?.() || '';
                if (!enteredCode.trim() || !enteredPassword || !captcha) {
                    message('원격 코드·비밀번호와 CAPTCHA 인증을 확인해 주세요.', 'Enter your code, password and complete CAPTCHA.');
                    return false;
                }
                payload = { serialCode: normalize(enteredCode), password: enteredPassword, recaptcha: captcha };
            }
            const data = await request(payload);
            // Ignore a late response if the user changed either credential.
            if (revision !== generation || code.value !== enteredCode || password.value !== enteredPassword) return false;
            code.value = data.serialCode;
            password.value = '';
            auth = { ticket: data.ticket, expiresAt: data.expiresAt, code: normalize(code.value), password: '' };
            const expectedAuth = auth;
            win.setTimeout(() => { if (auth === expectedAuth) invalidate(); }, Math.max(0, data.expiresAt * 1000 - now()));
            message('인증 완료! 이용권을 선택해 주세요.', 'Verified! Select your time plan.');
            if (ticket) doc.getElementById('recaptcha-box').style.display = 'none';
            doc.getElementById('pricingSection').scrollIntoView({ behavior: 'smooth' });
            return true;
        } catch {
            if (revision === generation) message('인증하지 못했습니다. 정보를 확인하거나 잠시 후 다시 시도해 주세요.', 'Unable to verify. Check your details or try again shortly.');
            return false;
        } finally {
            checking = false;
            if (!ticket) win.grecaptcha?.reset?.();
            buttons();
        }
    }

    async function pay(plan) {
        const priceId = plans[lang()][plan];
        if (!valid() || !priceId) { invalidate(); return false; }
        if (checking || checkoutOpen) return false;
        const selected = auth;
        const revision = generation;
        checking = true;
        buttons();
        try {
            // Revalidate expiry before charging; caller-provided device codes
            // and global booleans never determine the fulfillment destination.
            await request({ ticket: selected.ticket });
            if (auth !== selected || revision !== generation || !valid()) return false;
            if (!paddle?.Checkout?.open) throw new Error('Checkout unavailable');
            checkoutOpen = true;
            paddle.Checkout.open({ settings: { displayMode: 'overlay', theme: 'light', locale: lang() },
                items: [{ priceId, quantity: 1 }], customData: { checkout_ticket: selected.ticket } });
            return true;
        } catch {
            checkoutOpen = false;
            if (auth === selected) invalidate();
            message('결제를 준비하지 못했습니다. 기기를 다시 인증해 주세요.', 'Unable to start checkout. Verify your device again.');
            return false;
        } finally {
            checking = false;
            buttons();
        }
    }

    win.verifyDevice = () => verify(null);
    win.pay = pay;
    win.rechargeCheckoutEvent = name => {
        if (['checkout.closed', 'checkout.completed', 'checkout.error'].includes(name)) {
            checkoutOpen = false;
            buttons();
        }
    };
    invalidate();
    return { start: async (link = {}) => {
        if (link.code) code.value = link.code;
        if (link.ticket) return verify(link.ticket);
        return false;
    } };
}
