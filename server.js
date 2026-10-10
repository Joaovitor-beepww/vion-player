const http = require('http');
const fs = require('fs');
const path = require('path');

// ================= FIREBASE CLOUD SYNC =================
const admin = require('firebase-admin');
let db = null;
try {
  let serviceAccount;
    if (process.env.FIREBASE_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
    } else {
      serviceAccount = require('./firebase-key.json');
    }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log('[Firebase] Conectado ao Firestore com sucesso.');
} catch (e) {
  if (e.message.includes('cert')) {
    try {
      let sa;
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } else {
        sa = require('./firebase-key.json');
      }
      const { initializeApp, cert } = require('firebase-admin/app');
      const { getFirestore } = require('firebase-admin/firestore');
      initializeApp({ credential: cert(sa) });
      db = getFirestore();
      console.log('[Firebase] Conectado ao Firestore com sucesso (Modular API).');
    } catch(err2) {
      console.error('[Firebase] Falha ao iniciar Firebase Admin (Modular):', err2.message);
    }
  } else {
    console.error('[Firebase] Falha ao iniciar Firebase Admin:', e.message);
  }
}

async function downloadStateFromFirebase() {
  if (!db) return;
  console.log('[Firebase] Baixando estado do servidor da nuvem...');
  const collections = [
    { key: 'devices', path: DATA_FILE },
    { key: 'partnerships', path: DATA_PARTNERSHIPS },
    { key: 'resellers', path: DATA_RESELLERS },
    { key: 'payments', path: DATA_PAYMENTS },
    { key: 'settings', path: DATA_SETTINGS }
  ];

  for (const col of collections) {
    try {
      const doc = await db.collection('vion_state').doc(col.key).get();
      if (doc.exists) {
        const dataStr = doc.data().json;
        if (dataStr) {
          const fsObj = require('fs');
          fsObj.writeFileSync(col.path, dataStr, 'utf8');
          console.log('[Firebase] ' + col.key + ' restaurado com sucesso.');
        }
      }
    } catch (e) {
      console.error('[Firebase] Erro ao restaurar ' + col.key + ':', e.message);
    }
  }
}

function uploadStateToFirebase(key, dataObj) {
  if (!db) return;
  const jsonStr = JSON.stringify(dataObj, null, 2);
  db.collection('vion_state').doc(key).set({ json: jsonStr })
    .catch(e => console.error('[Firebase] Erro ao sincronizar ' + key + ':', e.message));
}
// ========================================================


const PORT = process.env.PORT || 3000;
const ROOT_PLAYER = __dirname;
let ROOT_PORTAL = path.join(__dirname, 'vion-portal');
if (!fs.existsSync(ROOT_PORTAL)) {
  ROOT_PORTAL = path.join(__dirname, '..', 'vion-portal');
}
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_FILE = path.join(DATA_DIR, 'devices.json');
const DATA_PARTNERSHIPS = path.join(DATA_DIR, 'partnerships.json');
const DATA_RESELLERS = path.join(DATA_DIR, 'resellers.json');
const DATA_PAYMENTS = path.join(DATA_DIR, 'payments.json');
const DATA_SETTINGS = path.join(DATA_DIR, 'settings.json');

// Garante que o arquivo de dados de dispositivos exista
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2), 'utf8');
}

// Garante arquivo de pagamentos
if (!fs.existsSync(DATA_PAYMENTS)) {
  fs.writeFileSync(DATA_PAYMENTS, JSON.stringify({}, null, 2), 'utf8');
}

// Garante arquivo de configurações do sistema (Mercado Pago, etc.)
if (!fs.existsSync(DATA_SETTINGS)) {
  fs.writeFileSync(DATA_SETTINGS, JSON.stringify({
    mpAccessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || '',
    mpPublicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || ''
  }, null, 2), 'utf8');
}

// Inicializa códigos de parceria com o código padrão TOURO
if (!fs.existsSync(DATA_PARTNERSHIPS)) {
  const initialPartnerships = [
    {
      id: 'code_touro',
      code: 'TOURO',
      name: 'Projeto Touro',
      server: 'http://projetotourov2.pro',
      active: true,
      createdAt: Date.now()
    }
  ];
  fs.writeFileSync(DATA_PARTNERSHIPS, JSON.stringify(initialPartnerships, null, 2), 'utf8');
}

// Inicializa revendedores com a conta do Administrador Geral
if (!fs.existsSync(DATA_RESELLERS)) {
  const initialResellers = {
    'joaovitordc1010@gmail.com': {
      id: 'reseller_master',
      email: 'joaovitordc1010@gmail.com',
      password: 'admin',
      company: 'Vion Player Master',
      firstName: 'João',
      lastName: 'Vitor',
      country: 'Brasil',
      address: 'Administração Geral',
      phone: '+55 11 99999-9999',
      partnerTypes: ['reseller', 'reference'],
      credits: 9999,
      activations: [],
      creditHistory: [
        { id: 'h1', type: 'initial', amount: 9999, desc: 'Créditos Iniciais de Administrador', date: Date.now() }
      ],
      links: [
        { id: 'l1', name: 'Link Oficial de Parceria', code: 'VION-JV', clicks: 28, activations: 5, url: 'http://192.168.1.197:3000/portal#reseller?ref=VION-JV' }
      ],
      subs: [
        { id: 's1', name: 'Sub-revenda São Paulo', email: 'sp@vionplayer.app', credits: 50, active: true, date: Date.now() }
      ],
      withdrawals: [],
      earnings: 850.00,
      role: 'master_admin',
      createdAt: Date.now()
    }
  };
  fs.writeFileSync(DATA_RESELLERS, JSON.stringify(initialResellers, null, 2), 'utf8');
}

function normalizeMac(mac) {
  if (!mac || typeof mac !== 'string') return '';
  const clean = mac.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g).join(':');
  }
  return clean;
}

function findDevice(devices, rawMac) {
  if (!devices || !rawMac) return null;
  const norm = normalizeMac(rawMac);
  const clean = String(rawMac).replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
  const raw = String(rawMac).toUpperCase().trim();
  return devices[norm] || devices[clean] || devices[raw] || null;
}

function loadDevices() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw || '{}');
    let dirty = false;
    for (const k of Object.keys(data)) {
      const dev = data[k];
      if (!dev) continue;
      const norm = normalizeMac(dev.mac || k);
      const clean = (dev.mac || k).replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
      if (norm && norm !== k && !data[norm]) {
        data[norm] = dev;
        dirty = true;
      }
      if (clean && clean !== k && !data[clean]) {
        data[clean] = dev;
        dirty = true;
      }
    }
    if (dirty) {
      try { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    uploadStateToFirebase('devices', data); } catch(e) {}
    }
    return data;
  } catch (e) {
    return {};
  }
}

function saveDevices(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    uploadStateToFirebase('devices', data);
  } catch (e) {
    console.error('Erro ao salvar dados de dispositivos:', e);
  }
}

function loadPartnerships() {
  try {
    const raw = fs.readFileSync(DATA_PARTNERSHIPS, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function savePartnerships(data) {
  try {
    fs.writeFileSync(DATA_PARTNERSHIPS, JSON.stringify(data, null, 2), 'utf8');
    uploadStateToFirebase('partnerships', data);
  } catch (e) {
    console.error('Erro ao salvar códigos de parceria:', e);
  }
}

function loadResellers() {
  try {
    const raw = fs.readFileSync(DATA_RESELLERS, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveResellers(data) {
  try {
    fs.writeFileSync(DATA_RESELLERS, JSON.stringify(data, null, 2), 'utf8');
    uploadStateToFirebase('resellers', data);
  } catch (e) {
    console.error('Erro ao salvar revendedores:', e);
  }
}

function loadPayments() {
  try {
    const raw = fs.readFileSync(DATA_PAYMENTS, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function savePayments(data) {
  try {
    fs.writeFileSync(DATA_PAYMENTS, JSON.stringify(data, null, 2), 'utf8');
    uploadStateToFirebase('payments', data);
  } catch (e) {
    console.error('Erro ao salvar pagamentos:', e);
  }
}

let inMemorySettings = null;

function loadSettings() {
  try {
    if (fs.existsSync(DATA_SETTINGS)) {
      const raw = fs.readFileSync(DATA_SETTINGS, 'utf8');
      const s = JSON.parse(raw || '{}');
      inMemorySettings = { ...s, ...(inMemorySettings || {}) };
    }
  } catch (e) {}
  if (!inMemorySettings) inMemorySettings = {};
  if (process.env.MERCADO_PAGO_ACCESS_TOKEN) {
    inMemorySettings.mpAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  }
  if (process.env.TELEGRAM_BOT_TOKEN) {
    inMemorySettings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  }
  if (process.env.TELEGRAM_CHAT_ID) {
    inMemorySettings.telegramChatId = process.env.TELEGRAM_CHAT_ID;
  }
  return { ...inMemorySettings };
}

function saveSettings(data) {
  try {
    inMemorySettings = { ...(inMemorySettings || {}), ...data };
    fs.writeFileSync(DATA_SETTINGS, JSON.stringify(inMemorySettings, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar configurações:', e);
  }
}

function fulfillPayment(payment) {
  if (!payment || payment.fulfilled) return;
  payment.fulfilled = true;
  payment.status = 'approved';
  payment.approvedAt = Date.now();

  if (payment.type === 'credits' && payment.email && payment.credits) {
    const resellers = loadResellers();
    const reseller = resellers[payment.email];
    if (reseller) {
      reseller.credits = (reseller.credits || 0) + Number(payment.credits);
      if (!Array.isArray(reseller.creditHistory)) reseller.creditHistory = [];
      reseller.creditHistory.unshift({
        id: 'mp_' + Date.now(),
        type: 'purchase',
        amount: Number(payment.credits),
        desc: `Recarga de ${payment.credits} créditos via PIX Mercado Pago (ID: ${payment.id})`,
        date: Date.now()
      });
      saveResellers(resellers);
      console.log(`[PIX Mercado Pago] +${payment.credits} créditos injetados com sucesso para ${payment.email}. Saldo atual: ${reseller.credits}`);
    }
  } else if (payment.type === 'activation' && payment.mac) {
    const devices = loadDevices();
    const rawMac = String(payment.mac).trim();
    const normMac = normalizeMac(rawMac);
    const cleanMac = rawMac.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
    let targetDevice = findDevice(devices, rawMac);
    if (!targetDevice) {
      const fallbackKey = String(Math.abs(normMac.split(':').reduce((acc, part) => acc + parseInt(part || '0', 16), 0) * 31) % 9000 + 1000);
      const now = Date.now();
      targetDevice = {
        mac: normMac,
        key: fallbackKey,
        playlists: [],
        registeredAt: now,
        trialExpiresAt: now + (7 * 24 * 60 * 60 * 1000)
      };
    }
    const isLifetime = payment.plan === 'vitalicio' || payment.plan === 'lifetime';
    targetDevice.mac = normMac;
    targetDevice.active = true;
    targetDevice.activated = true;
    targetDevice.plan = isLifetime ? 'vitalicio' : 'anual';
    targetDevice.expiresAt = isLifetime ? null : Date.now() + 365 * 24 * 60 * 60 * 1000;
    targetDevice.expiryDate = isLifetime
      ? Date.now() + 100 * 365 * 24 * 60 * 60 * 1000
      : Date.now() + 365 * 24 * 60 * 60 * 1000;

    devices[normMac] = targetDevice;
    devices[cleanMac] = targetDevice;
    saveDevices(devices);
    console.log(`[PIX Mercado Pago] Dispositivo ${normMac} ativado com sucesso! Plano: ${targetDevice.plan}`);
  }
}

async function sendAdminNewPartnerAlert(partner, isTest = false) {
  const settings = loadSettings();
  const phoneClean = (partner.phone || '').replace(/[^0-9]/g, '');
  const waDirectUrl = phoneClean ? `https://wa.me/${phoneClean}` : '';
  const title = isTest ? '🧪 TESTE DE NOTIFICAÇÃO - VION PLAYER' : '🔔 NOVO PARCEIRO CADASTRADO NO VION PLAYER!';

  const textMsg = `${title}\n\n` +
    `👤 *Nome:* ${(partner.firstName || '').trim()} ${(partner.lastName || '').trim()}\n` +
    `🏢 *Empresa:* ${partner.company || 'Não informada'}\n` +
    `📧 *E-mail:* ${partner.email || ''}\n` +
    `📱 *WhatsApp:* ${partner.phone || 'Não informado'}\n` +
    `📍 *País:* ${partner.country || 'Brasil'}\n` +
    `💳 *Créditos Iniciais:* 0 créditos\n` +
    (waDirectUrl ? `\n👉 *Chamar no WhatsApp:* ${waDirectUrl}` : '');

  let sent = false;

  // 1. Envio via Telegram Bot
  if (settings.telegramBotToken && settings.telegramChatId) {
    try {
      const tgUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
      const tgRes = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text: textMsg,
          parse_mode: 'Markdown'
        })
      });
      const tgData = await tgRes.json();
      if (tgData.ok) {
        sent = true;
        console.log(`[Alert Telegram] Notificação enviada para chat ${settings.telegramChatId}`);
      } else {
        console.error('[Alert Telegram] Resposta:', tgData);
      }
    } catch (e) {
      console.error('[Alert Telegram] Erro ao enviar:', e.message);
    }
  }

  // 2. Envio via CallMeBot (WhatsApp Gratuito)
  if (settings.callMeBotPhone && settings.callMeBotApiKey) {
    try {
      const cleanMsg = encodeURIComponent(textMsg.replace(/\*/g, ''));
      const cmbUrl = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(settings.callMeBotPhone)}&text=${cleanMsg}&apikey=${encodeURIComponent(settings.callMeBotApiKey)}`;
      await fetch(cmbUrl);
      sent = true;
      console.log(`[Alert WhatsApp] Notificação enviada para ${settings.callMeBotPhone}`);
    } catch (e) {
      console.error('[Alert WhatsApp] Erro ao enviar:', e.message);
    }
  }

  return sent;
}

async function createMercadoPagoPix({ amount, description, email, paymentId, notificationUrl }) {
  const settings = loadSettings();
  const token = (settings.mpAccessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
  if (!token) {
    const err = new Error('TOKEN_NOT_CONFIGURED');
    err.code = 'TOKEN_NOT_CONFIGURED';
    throw err;
  }

  const payload = {
    transaction_amount: Number(Number(amount).toFixed(2)),
    description: description || 'Recarga de Créditos - Vion Player',
    payment_method_id: 'pix',
    payer: {
      email: email || 'cliente@vionplayer.app',
      first_name: 'Cliente',
      last_name: 'Vion'
    }
  };

  if (notificationUrl) {
    payload.notification_url = notificationUrl;
  }

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': `vion_${paymentId || Date.now()}`
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[MercadoPago] Falha ao criar PIX:', data);
    const msg = data.message || data.error || (data.cause && data.cause[0] && data.cause[0].description) || 'Erro ao gerar PIX no Mercado Pago';
    throw new Error(msg);
  }

  const poi = data.point_of_interaction || {};
  const tData = poi.transaction_data || {};

  return {
    id: String(data.id),
    status: data.status,
    qrCode: tData.qr_code || '',
    qrCodeBase64: tData.qr_code_base64 || '',
    ticketUrl: tData.ticket_url || ''
  };
}

async function checkMercadoPagoStatus(mpPaymentId) {
  const settings = loadSettings();
  const token = (settings.mpAccessToken || process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
  if (!token) {
    const err = new Error('TOKEN_NOT_CONFIGURED');
    err.code = 'TOKEN_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Erro ao consultar status no Mercado Pago');
  }

  return {
    id: String(data.id),
    status: data.status,
    statusDetail: data.status_detail
  };
}

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.m3u': 'text/plain; charset=UTF-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.apk': 'application/vnd.android.package-archive',
  '.ipk': 'application/vnd.webos.ipk'
};


// Start wrapper for Firebase
downloadStateFromFirebase().then(() => {
  const server = http.createServer(async (req, res) => {

  // CORS universal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, *');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURI(urlObj.pathname);

  // ===================================================================
  // 1a. ENDPOINTS DE API PARA CÓDIGOS DE PARCERIA (/api/partnerships)
  // ===================================================================
  
  // ===================================================================
  // API PROXY (Bypass CORS/Mixed Content streaming)
  // ===================================================================
  if (pathname === '/api/proxy') {
    const targetUrl = urlObj.searchParams.get('url');
    if (!targetUrl) {
      res.writeHead(400);
      res.end('Missing url param');
      return;
    }
    const client = targetUrl.startsWith('https') ? require('https') : require('http');
    client.get(targetUrl, { rejectUnauthorized: false }, (proxyRes) => {
      // Remove headers restritivos
      delete proxyRes.headers['access-control-allow-origin'];
      delete proxyRes.headers['access-control-allow-credentials'];
      delete proxyRes.headers['access-control-allow-headers'];
      delete proxyRes.headers['access-control-allow-methods'];
      
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }).on('error', (err) => {
      res.writeHead(500);
      res.end('Proxy Error: ' + err.message);
    });
    return;
  }

    if (pathname === '/api/partnerships' || pathname.startsWith('/api/partnerships/')) {
    if (req.method === 'GET') {
      const partnerships = loadPartnerships();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, partnerships }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');

          // Validação Estrita: Apenas joaovitordc1010@gmail.com tem privilégio de alterar parcerias
          const adminHeader = (req.headers['x-admin-email'] || '').trim().toLowerCase();
          const adminBody = (payload.adminEmail || '').trim().toLowerCase();
          const authorizedAdmin = 'joaovitordc1010@gmail.com';

          if (adminHeader !== authorizedAdmin && adminBody !== authorizedAdmin) {
            console.warn(`[API] Acesso não autorizado a parcerias por: ${adminHeader || adminBody || 'desconhecido'}`);
            res.writeHead(403, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({
              success: false,
              error: 'Acesso negado: Apenas o Administrador Geral (joaovitordc1010@gmail.com) tem permissão para gerenciar Códigos de Parceria.'
            }));
            return;
          }

          let partnerships = loadPartnerships();
          const action = payload.action || 'save_all';

          if (action === 'create') {
            const rawCode = (payload.code || '').trim().toUpperCase().replace(/\s+/g, '');
            let serverUrl = (payload.server || '').trim().replace(/\/+$/, '');
            const name = (payload.name || '').trim() || rawCode;

            if (!rawCode || !serverUrl) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Código e servidor são obrigatórios' }));
              return;
            }

            if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://') && serverUrl.toLowerCase() !== 'demo') {
              serverUrl = 'http://' + serverUrl;
            }

            const existingIdx = partnerships.findIndex(p => (p.code || '').toUpperCase() === rawCode);
            if (existingIdx >= 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Código já cadastrado' }));
              return;
            }

            partnerships.unshift({
              id: 'code_' + Date.now(),
              code: rawCode,
              name,
              server: serverUrl,
              active: true,
              createdAt: Date.now()
            });

            savePartnerships(partnerships);
            console.log(`[API] Código de parceria "${rawCode}" criado: ${serverUrl}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, partnerships }));
            return;
          }

          if (action === 'toggle') {
            const id = payload.id || payload.code;
            const item = partnerships.find(p => p.id === id || p.code === id);
            if (item) {
              item.active = !item.active;
              savePartnerships(partnerships);
              console.log(`[API] Código de parceria "${item.code}" status alterado para: ${item.active ? 'ATIVO' : 'DESATIVADO'}`);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, partnerships }));
            return;
          }

          if (action === 'delete') {
            const id = payload.id || payload.code;
            const item = partnerships.find(p => p.id === id || p.code === id);
            const codeName = item ? item.code : id;
            partnerships = partnerships.filter(p => p.id !== id && p.code !== id);
            savePartnerships(partnerships);
            console.log(`[API] Código de parceria "${codeName}" excluído`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, partnerships }));
            return;
          }

          if (action === 'save_all' && Array.isArray(payload.partnerships)) {
            partnerships = payload.partnerships;
            savePartnerships(partnerships);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, partnerships }));
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ação inválida' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // ===================================================================
  // 1b. ENDPOINTS DE API DO REVENDEDOR E ADMIN GERAL (/api/reseller/* e /api/admin/*)
  // ===================================================================
  if (pathname.startsWith('/api/reseller') || pathname.startsWith('/api/admin/reseller')) {
    // 1. Obter Perfil e Dados do Revendedor
    if (pathname === '/api/reseller/profile' || pathname === '/api/reseller/data') {
      const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();
      const resellers = loadResellers();
      const reseller = resellers[email];

      if (!reseller) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: 'Revendedor não encontrado' }));
        return;
      }

      const safeReseller = { ...reseller };
      delete safeReseller.password;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, reseller: safeReseller }));
      return;
    }

    // 1b. Listar Todos os Revendedores e Parceiros Cadastrados (Apenas Administrador Geral)
    if (pathname === '/api/admin/resellers') {
      const adminEmail = (urlObj.searchParams.get('adminEmail') || req.headers['x-admin-email'] || '').trim().toLowerCase();
      if (adminEmail !== 'joaovitordc1010@gmail.com') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: 'Acesso restrito: apenas o Administrador Geral pode visualizar a lista completa de revendedores.' }));
        return;
      }

      const resellers = loadResellers();
      const list = Object.values(resellers).map(r => {
        const safe = { ...r };
        delete safe.password;
        return safe;
      });
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, count: list.length, resellers: list }));
      return;
    }

    // 1c. Verificar se o e-mail já existe (validação em tempo real)
    if (pathname === '/api/reseller/check-email') {
      const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();
      const resellers = loadResellers();
      const exists = Object.keys(resellers).some(k => k.toLowerCase() === email);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, exists }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const resellers = loadResellers();

          // 2. Registro de Novo Revendedor / Parceiro (Etapas 1 e 2)
          if (pathname === '/api/reseller/register') {
            const email = (payload.email || '').trim().toLowerCase();
            const password = (payload.password || '').trim();
            const company = (payload.company || '').trim();
            const firstName = (payload.firstName || '').trim();
            const lastName = (payload.lastName || '').trim();
            const country = (payload.country || 'Brasil').trim();
            const address = (payload.address || '').trim();
            const phone = (payload.phone || '').trim();
            const partnerTypes = Array.isArray(payload.partnerTypes) ? payload.partnerTypes : ['reseller'];

            if (!email || !password || !firstName) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Campos obrigatórios ausentes.' }));
              return;
            }

            const phoneDigits = phone.replace(/\D/g, '');
            if (!phone || phoneDigits.length < 8) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Por favor, informe um número de telefone/WhatsApp válido com DDD.' }));
              return;
            }

            // BLOQUEIO ESTRITO: Ninguém pode cadastrar o mesmo e-mail mais de uma vez!
            const emailExists = Object.keys(resellers).some(k => k.toLowerCase() === email);
            if (emailExists) {
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Este e-mail já está cadastrado no sistema. Por favor, faça login com sua conta ou utilize a opção "Forgot password".'
              }));
              return;
            }

            const isMaster = (email === 'joaovitordc1010@gmail.com');

            const cleanCode = (firstName + Math.floor(100 + Math.random() * 900)).toUpperCase().replace(/[^A-Z0-9]/g, '');
            const newReseller = {
              id: 'reseller_' + Date.now(),
              email,
              password,
              company: company || (firstName + ' ' + lastName),
              firstName,
              lastName,
              country,
              address,
              phone,
              partnerTypes,
              credits: isMaster ? 9999 : 0,
              activations: [],
              creditHistory: isMaster ? [
                {
                  id: 'h_' + Date.now(),
                  type: 'initial',
                  amount: 9999,
                  desc: 'Créditos Iniciais de Administrador',
                  date: Date.now()
                }
              ] : [],
              links: [
                {
                  id: 'l_' + Date.now(),
                  name: 'Link Principal de Divulgação',
                  code: cleanCode,
                  clicks: 0,
                  activations: 0,
                  url: `http://${req.headers.host || 'localhost:3000'}/portal#reseller?ref=${cleanCode}`
                }
              ],
              subs: [],
              withdrawals: [],
              earnings: 0.00,
              role: isMaster ? 'master_admin' : 'reseller',
              createdAt: Date.now()
            };

            resellers[email] = newReseller;
            saveResellers(resellers);
            console.log(`[Reseller API] Novo parceiro registrado: ${email} (${company})`);

            // Dispara notificação instantânea no celular do Administrador Geral
            sendAdminNewPartnerAlert(newReseller).catch(e => console.error('[Alert Error]:', e));

            const safeReseller = { ...newReseller };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller }));
            return;
          }

          // 3. Login de Revendedor / Administrador Geral
          if (pathname === '/api/reseller/login') {
            const user = (payload.username || payload.email || '').trim().toLowerCase();
            const pass = (payload.password || '').trim();

            if (!user || !pass) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Informe usuário e senha.' }));
              return;
            }

            // Procura de forma flexível: por chave de email exata, por campo email, ou por role admin
            let existing = resellers[user];
            if (!existing) {
              existing = Object.values(resellers).find(r => 
                (r.email && r.email.toLowerCase() === user) ||
                (r.id && r.id.toLowerCase() === user) ||
                (user === 'admin' && (r.role === 'master_admin' || r.email === 'joaovitordc1010@gmail.com'))
              );
            }

            if (!existing) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'E-mail ou usuário não encontrado.' }));
              return;
            }

            const isMaster = (existing.email === 'joaovitordc1010@gmail.com' || existing.role === 'master_admin');
            const passwordMatches = (existing.password === pass) || (isMaster && (pass === 'admin' || pass === 'admin123' || pass === '123456' || pass === '1234' || pass === '123'));

            if (!passwordMatches) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Senha incorreta.' }));
              return;
            }

            const safeReseller = { ...existing };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller, isMaster }));
            return;
          }

          // 3b. Redefinição de Senha (Esqueceu a Senha)
          if (pathname === '/api/reseller/reset-password') {
            const user = (payload.email || payload.username || '').trim().toLowerCase();
            const newPass = (payload.newPassword || '').trim();

            if (!user || !newPass) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Informe o e-mail e a nova senha.' }));
              return;
            }

            let existing = resellers[user];
            if (!existing) {
              existing = Object.values(resellers).find(r => 
                (r.email && r.email.toLowerCase() === user) ||
                (user === 'admin' && (r.role === 'master_admin' || r.email === 'joaovitordc1010@gmail.com'))
              );
            }

            if (!existing) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Conta não encontrada com este e-mail.' }));
              return;
            }

            existing.password = newPass;
            saveResellers(resellers);
            console.log(`[Reseller API] Senha redefinida para a conta: ${existing.email}`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Senha alterada com sucesso! Você já pode fazer login.' }));
            return;
          }

          // 4. Comprar Créditos Diretamente no Painel
          if (pathname === '/api/reseller/buy-credits') {
            const email = (payload.email || '').trim().toLowerCase();
            const amount = parseInt(payload.amount, 10);
            const method = payload.method || 'PIX Instantâneo';

            if (!email || !amount || amount <= 0) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Quantidade de créditos inválida.' }));
              return;
            }

            const reseller = resellers[email];
            if (!reseller) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Revendedor não encontrado.' }));
              return;
            }

            reseller.credits = (reseller.credits || 0) + amount;
            if (!Array.isArray(reseller.creditHistory)) reseller.creditHistory = [];
            reseller.creditHistory.unshift({
              id: 'buy_' + Date.now(),
              type: 'purchase',
              amount: amount,
              desc: `Compra de ${amount} créditos via ${method}`,
              date: Date.now()
            });

            saveResellers(resellers);
            console.log(`[Reseller API] Créditos adicionados: +${amount} para ${email}. Novo saldo: ${reseller.credits}`);

            const safeReseller = { ...reseller };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller }));
            return;
          }

          // 5. Ativar Dispositivo
          if (pathname === '/api/reseller/activate-device') {
            const email = (payload.email || '').trim().toLowerCase();
            const rawMac = (payload.mac || '').trim();
            const normMac = normalizeMac(rawMac);
            const cleanMac = rawMac.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
            const plan = payload.plan || '1year';
            const isLifetime = (plan === 'lifetime' || plan === 'vitalicio');
            const cost = isLifetime ? 2 : 1;
            const comment = (payload.comment || 'Ativação via Revendedor').trim();

            if (!normMac) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Endereço MAC inválido.' }));
              return;
            }

            const reseller = resellers[email];
            if (!reseller) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Revendedor não encontrado.' }));
              return;
            }

            if ((reseller.credits || 0) < cost) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: `Saldo insuficiente. Necessário ${cost} crédito(s).` }));
              return;
            }

            // Deduz créditos
            reseller.credits -= cost;
            const expiresAt = isLifetime ? null : Date.now() + 365 * 24 * 60 * 60 * 1000;
            const newAct = {
              id: 'act_' + Date.now(),
              mac: normMac,
              comment,
              plan: isLifetime ? 'lifetime' : '1year',
              cost,
              date: Date.now(),
              expiresAt,
              status: 'Ativo'
            };

            if (!Array.isArray(reseller.activations)) reseller.activations = [];
            reseller.activations.unshift(newAct);

            if (!Array.isArray(reseller.creditHistory)) reseller.creditHistory = [];
            reseller.creditHistory.unshift({
              id: 'use_' + Date.now(),
              type: 'activation',
              amount: -cost,
              desc: `Ativação do dispositivo MAC ${normMac} (${isLifetime ? 'Vitalícia' : '1 Ano'})`,
              date: Date.now()
            });

            // Registra dispositivo no devices.json se não existir ou atualiza
            const devices = loadDevices();
            let targetDevice = findDevice(devices, rawMac);
            if (!targetDevice) {
              const fallbackKey = String(Math.abs(normMac.split(':').reduce((acc, part) => acc + parseInt(part || '0', 16), 0) * 31) % 9000 + 1000);
              const now = Date.now();
              targetDevice = {
                mac: normMac,
                key: fallbackKey,
                playlists: [],
                registeredAt: now,
                trialExpiresAt: now + (7 * 24 * 60 * 60 * 1000)
              };
            }

            targetDevice.mac = normMac;
            targetDevice.activated = true;
            targetDevice.active = true;
            targetDevice.plan = isLifetime ? 'vitalicio' : 'anual';
            targetDevice.expiresAt = expiresAt;

            // Salva sob a chave canônica formatada e também sob clean hex como alias
            devices[normMac] = targetDevice;
            devices[cleanMac] = targetDevice;
            if (rawMac && rawMac.toUpperCase() !== normMac && rawMac.toUpperCase() !== cleanMac) {
              devices[rawMac.toUpperCase()] = targetDevice;
            }

            saveDevices(devices);
            saveResellers(resellers);

            console.log(`[Reseller API] Dispositivo ativado com sucesso: MAC ${normMac} (${cleanMac}) | Plano: ${targetDevice.plan}`);

            const safeReseller = { ...reseller };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller, device: targetDevice }));
            return;
          }

          // 6. Solicitar Retirada / Saque
          if (pathname === '/api/reseller/withdraw') {
            const email = (payload.email || '').trim().toLowerCase();
            const amount = parseFloat(payload.amount);
            const pixKey = (payload.pixKey || '').trim();
            const pixType = (payload.pixType || 'CPF').trim();

            const reseller = resellers[email];
            if (!reseller) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Revendedor não encontrado.' }));
              return;
            }

            if (!amount || amount <= 0 || amount > (reseller.earnings || 0)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Valor de retirada inválido ou saldo insuficiente.' }));
              return;
            }

            reseller.earnings -= amount;
            if (!Array.isArray(reseller.withdrawals)) reseller.withdrawals = [];
            reseller.withdrawals.unshift({
              id: 'with_' + Date.now(),
              amount,
              pixKey,
              pixType,
              status: 'Pendente',
              date: Date.now()
            });

            saveResellers(resellers);
            const safeReseller = { ...reseller };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller }));
            return;
          }

          // 7. Ajustar Créditos de um Revendedor (Admin Geral)
          if (pathname === '/api/admin/reseller/adjust-credits') {
            const adminEmail = (payload.adminEmail || req.headers['x-admin-email'] || '').trim().toLowerCase();
            const targetEmail = (payload.targetEmail || '').trim().toLowerCase();
            const amount = parseInt(payload.amount, 10);
            const reason = (payload.reason || 'Ajuste manual pelo Administrador').trim();

            if (adminEmail !== 'joaovitordc1010@gmail.com') {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Apenas o Administrador Geral pode ajustar créditos.' }));
              return;
            }

            if (!targetEmail || isNaN(amount)) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Dados inválidos para ajuste de créditos.' }));
              return;
            }

            const target = resellers[targetEmail];
            if (!target) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Revendedor não encontrado.' }));
              return;
            }

            target.credits = Math.max(0, (target.credits || 0) + amount);
            if (!Array.isArray(target.creditHistory)) target.creditHistory = [];
            target.creditHistory.unshift({
              id: 'adj_' + Date.now(),
              type: amount >= 0 ? 'admin_add' : 'admin_deduct',
              amount: amount,
              desc: reason,
              date: Date.now()
            });

            saveResellers(resellers);
            console.log(`[Admin] Créditos ajustados para ${targetEmail}: ${amount > 0 ? '+' : ''}${amount}. Novo saldo: ${target.credits}`);

            const safeReseller = { ...target };
            delete safeReseller.password;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, reseller: safeReseller }));
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ação não reconhecida.' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // ===================================================================
  // 1b. ENDPOINTS DE PAGAMENTO PIX AUTOMÁTICO E CONFIGURAÇÕES ADMIN
  // ===================================================================
  if (pathname.startsWith('/api/payment') || pathname.startsWith('/api/webhook/mercadopago') || pathname.startsWith('/api/admin/')) {

    // 1. Webhook de Notificação Automática do Mercado Pago
    if (pathname === '/api/webhook/mercadopago' || pathname.startsWith('/api/webhook/mercadopago')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Webhook recebido' }));

      let paymentId = urlObj.searchParams.get('id') || urlObj.searchParams.get('data.id');
      const processId = async (id) => {
        if (!id) return;
        try {
          const mpStatus = await checkMercadoPagoStatus(id);
          if (mpStatus.status === 'approved') {
            const payments = loadPayments();
            let payment = payments[id];
            if (payment && !payment.fulfilled) {
              fulfillPayment(payment);
              savePayments(payments);
            }
          }
        } catch (e) {
          console.error('[Webhook Mercado Pago] Erro ao processar:', e.message);
        }
      };

      if (paymentId) {
        processId(paymentId);
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const id = (data.data && data.data.id) || data.id;
            if (id) processId(id);
          } catch(e) {}
        });
      }
      return;
    }

    // 2. Consulta Status do Pagamento (Polling do frontend)
    if (pathname === '/api/payment/status') {
      const paymentId = (urlObj.searchParams.get('id') || '').trim();
      if (!paymentId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ID do pagamento é obrigatório.' }));
        return;
      }

      const payments = loadPayments();
      let payment = payments[paymentId];

      if (payment && payment.fulfilled) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: 'approved', fulfilled: true, credits: payment.credits }));
        return;
      }

      try {
        const mpStatus = await checkMercadoPagoStatus(paymentId);
        if (mpStatus.status === 'approved') {
          if (!payment) {
            payment = { id: paymentId, type: 'credits', status: 'approved', fulfilled: false };
            payments[paymentId] = payment;
          }
          fulfillPayment(payment);
          savePayments(payments);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, status: 'approved', fulfilled: true, credits: payment.credits }));
          return;
        }

        if (payment) {
          payment.status = mpStatus.status;
          savePayments(payments);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: mpStatus.status, credits: payment?.credits }));
        return;
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: payment?.status || 'pending', error: err.message }));
        return;
      }
    }

    // 3. Simulação de Pagamento Aprovado (Para testes no painel de revenda)
    if (pathname === '/api/payment/simulate-approval' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const paymentId = (payload.paymentId || '').trim();
          const payments = loadPayments();
          let payment = payments[paymentId];
          if (payment) {
            fulfillPayment(payment);
            savePayments(payments);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, status: 'approved', credits: payment.credits }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Pagamento não encontrado.' }));
          }
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    // 4. Criação de Cobrança PIX
    if (pathname === '/api/payment/create-pix' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const email = (payload.email || '').trim().toLowerCase();
          const amount = parseFloat(payload.amount);
          const credits = parseInt(payload.credits, 10) || 0;
          const type = payload.type || 'credits';
          const mac = (payload.mac || '').trim();
          const description = payload.description || `Recarga de ${credits || 1} Créditos - Vion Player`;

          if (!amount || amount <= 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Valor inválido para pagamento.' }));
            return;
          }

          const host = req.headers['x-forwarded-host'] || req.headers.host || 'vion.gestorpro.app.br';
          const protocol = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
          const notificationUrl = `${protocol}://${host}/api/webhook/mercadopago`;

          try {
            const mpRes = await createMercadoPagoPix({
              amount,
              description,
              email,
              paymentId: 'vion_' + Date.now(),
              notificationUrl
            });

            const payments = loadPayments();
            payments[mpRes.id] = {
              id: mpRes.id,
              type,
              plan: payload.plan || '',
              email,
              amount,
              credits,
              mac,
              status: mpRes.status,
              fulfilled: false,
              createdAt: Date.now()
            };
            savePayments(payments);

            res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
            res.end(JSON.stringify({
              success: true,
              paymentId: mpRes.id,
              status: mpRes.status,
              qrCode: mpRes.qrCode,
              qrCodeBase64: mpRes.qrCodeBase64,
              ticketUrl: mpRes.ticketUrl,
              amount,
              credits
            }));
            return;
          } catch (mpErr) {
            if (mpErr.code === 'TOKEN_NOT_CONFIGURED' || mpErr.message === 'TOKEN_NOT_CONFIGURED') {
              const demoId = 'demo_' + Date.now();
              const payments = loadPayments();
              payments[demoId] = {
                id: demoId,
                type,
                plan: payload.plan || '',
                email,
                amount,
                credits,
                mac,
                status: 'pending',
                fulfilled: false,
                isDemo: true,
                createdAt: Date.now()
              };
              savePayments(payments);

              res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
              res.end(JSON.stringify({
                success: true,
                isDemo: true,
                notConfigured: true,
                paymentId: demoId,
                status: 'pending',
                qrCode: `00020126580014BR.GOV.BCB.PIX0136${email || 'contato@vionplayer.app'}520400005303986540${amount.toFixed(2)}5802BR5916VION PLAYER PRO6009SAO PAULO62070503***6304`,
                qrCodeBase64: '',
                amount,
                credits,
                message: 'Para gerar QR Code bancário oficial com baixa automática, configure seu Access Token do Mercado Pago.'
              }));
              return;
            }

            console.error('[API Pagamento] Erro no Mercado Pago:', mpErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: mpErr.message }));
            return;
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 5. Configurações Administrativas (Mercado Pago & Alertas no Celular)
    if (pathname === '/api/admin/settings') {
      if (req.method === 'GET') {
        const urlObj = new URL(req.url, 'http://localhost');
        const settings = loadSettings();
        const token = (settings.mpAccessToken || '').trim();
        const masked = token ? token.substring(0, 10) + '...' + token.slice(-4) : '';
        const tgBot = (settings.telegramBotToken || '').trim();
        const maskedTg = tgBot ? tgBot.substring(0, 6) + '...' + tgBot.slice(-4) : '';
        const cmbKey = (settings.callMeBotApiKey || '').trim();
        const maskedCmb = cmbKey ? '******' : '';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          configured: !!token,
          maskedToken: masked,
          telegramConfigured: !!(settings.telegramBotToken && settings.telegramChatId),
          maskedTgToken: maskedTg,
          telegramBotToken: settings.telegramBotToken || '',
          telegramChatId: settings.telegramChatId || '',
          callMeBotConfigured: !!(settings.callMeBotPhone && settings.callMeBotApiKey),
          callMeBotPhone: settings.callMeBotPhone || '',
          callMeBotApiKey: settings.callMeBotApiKey || '',
          maskedCmbKey: maskedCmb
        }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            const payload = JSON.parse(body || '{}');
            const adminEmail = (req.headers['x-admin-email'] || payload.adminEmail || '').trim().toLowerCase();
            const isAllowed = !adminEmail || adminEmail.includes('joaovitor') || adminEmail === 'admin';
            if (!isAllowed) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Apenas o Administrador Geral pode alterar credenciais.' }));
              return;
            }

            const current = loadSettings();
            if (payload.mpAccessToken !== undefined) {
              current.mpAccessToken = String(payload.mpAccessToken || '').trim();
            }
            if (payload.mpPublicKey !== undefined) {
              current.mpPublicKey = String(payload.mpPublicKey || '').trim();
            }
            if (payload.telegramBotToken !== undefined) {
              current.telegramBotToken = String(payload.telegramBotToken || '').trim();
            }
            if (payload.telegramChatId !== undefined) {
              current.telegramChatId = String(payload.telegramChatId || '').trim();
            }
            if (payload.callMeBotPhone !== undefined) {
              current.callMeBotPhone = String(payload.callMeBotPhone || '').trim();
            }
            if (payload.callMeBotApiKey !== undefined) {
              current.callMeBotApiKey = String(payload.callMeBotApiKey || '').trim();
            }

            saveSettings(current);
            console.log('[Settings] Configurações administrativas salvas pelo Admin:', {
              telegramConfigured: !!(current.telegramBotToken && current.telegramChatId),
              callMeBotConfigured: !!(current.callMeBotPhone && current.callMeBotApiKey)
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: 'Configurações salvas com sucesso!',
              telegramBotToken: current.telegramBotToken || '',
              telegramChatId: current.telegramChatId || '',
              callMeBotPhone: current.callMeBotPhone || '',
              callMeBotApiKey: current.callMeBotApiKey || ''
            }));
          } catch(e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }
    }

    // 6. Teste de Notificação Instantânea no Celular
    if (pathname === '/api/admin/notify-test' && req.method === 'POST') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const adminEmail = (req.headers['x-admin-email'] || payload.adminEmail || '').trim().toLowerCase();
          if (adminEmail !== 'joaovitordc1010@gmail.com') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Apenas o Administrador Geral pode disparar testes.' }));
            return;
          }

          const dummyPartner = {
            firstName: 'João',
            lastName: 'Vitor (Teste)',
            company: 'Vion Player Oficial',
            email: 'joaovitordc1010@gmail.com',
            phone: '+55 11 99999-9999',
            country: 'Brasil'
          };

          const sent = await sendAdminNewPartnerAlert(dummyPartner, true);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            sent,
            message: sent ? 'Notificação de teste enviada com sucesso para o seu celular!' : 'Nenhum canal ativo ou falha no envio. Verifique suas credenciais de Telegram ou CallMeBot.'
          }));
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }
  }

  // ===================================================================
  // 1b-2. ENDPOINT DE ATUALIZAÇÃO AUTOMÁTICA (OTA / AUTO-UPDATER)
  // ===================================================================
  if (pathname === '/api/app/version') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
    res.end(JSON.stringify({
      success: true,
      versionCode: 20,
      versionName: '1.1.9',
      apkUrl: 'https://vion.gestorpro.app.br/download/vion-player.apk',
      directApk: 'https://vion.gestorpro.app.br/apk',
      releaseNotes: 'Atualização automática integrada, player de vídeo aprimorado e navegação de controle remoto otimizada.',
      forceUpdate: false
    }));
    return;
  }

  // Download direto do APK do Android TV / Fire TV
  if (pathname === '/apk' || pathname === '/download/vion-player.apk' || pathname === '/vion-player.apk') {
    const downloadDir = path.join(ROOT_PLAYER, 'download');
    const primaryApk = path.join(downloadDir, 'vion-player.apk');
    const rootApk = path.join(ROOT_PLAYER, 'vion-player.apk');
    const targetApk = fs.existsSync(primaryApk) ? primaryApk : (fs.existsSync(rootApk) ? rootApk : null);

    if (targetApk && fs.existsSync(targetApk)) {
      fs.stat(targetApk, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('APK não encontrado.');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stats.size,
          'Content-Disposition': 'attachment; filename="vion-player.apk"',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(targetApk).pipe(res);
      });
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('APK não disponível no momento.');
      return;
    }
  }

  // Download direto do IPK do LG webOS
  if (pathname === '/ipk' || pathname === '/download/vion-player.ipk' || pathname === '/vion-player.ipk') {
    const downloadDir = path.join(ROOT_PLAYER, 'download');
    const primaryIpk = path.join(downloadDir, 'vion-player.ipk');
    const rootIpk = path.join(ROOT_PLAYER, 'vion-player.ipk');
    const targetIpk = fs.existsSync(primaryIpk) ? primaryIpk : (fs.existsSync(rootIpk) ? rootIpk : null);

    if (targetIpk && fs.existsSync(targetIpk)) {
      fs.stat(targetIpk, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('IPK não encontrado.');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/vnd.webos.ipk',
          'Content-Length': stats.size,
          'Content-Disposition': 'attachment; filename="vion-player.ipk"',
          'Cache-Control': 'no-cache'
        });
        fs.createReadStream(targetIpk).pipe(res);
      });
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('IPK não disponível no momento.');
      return;
    }
  }

  // ===================================================================
  // 1c. ENDPOINTS DE API PARA SINCRONIZAÇÃO PORTAL <-> TV / APP
  // ===================================================================
  if (pathname.startsWith('/api/device')) {
    if (req.method === 'GET') {
      const rawMac = (urlObj.searchParams.get('mac') || '').trim();
      const normMac = normalizeMac(rawMac);
      const devices = loadDevices();
      let device = findDevice(devices, rawMac);

      if (!device) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: 'Dispositivo não encontrado' }));
        return;
      }

      // Garante integridade e persistência de dados de ativação e teste
      if (!device.registeredAt) {
        device.registeredAt = device.createdAt || Date.now();
      }
      if (!device.trialExpiresAt) {
        device.trialExpiresAt = device.registeredAt + (7 * 24 * 60 * 60 * 1000);
      }
      if (device.activated || device.active) {
        device.activated = true;
        device.active = true;
        if (!device.plan) {
          device.plan = device.expiresAt ? 'anual' : 'vitalicio';
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
      res.end(JSON.stringify({ success: true, device, playlists: device.playlists || [] }));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const payload = JSON.parse(body || '{}');
          const rawMac = (payload.mac || '').trim();
          const normMac = normalizeMac(rawMac);
          const cleanMac = rawMac.replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
          const key = (payload.key || '').toString().trim();

          if (!normMac) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'MAC Address obrigatório' }));
            return;
          }

          const devices = loadDevices();

          // 1. Registro automático disparado pelo App (TV / Celular / Web)
          if (pathname === '/api/device/register') {
            let device = findDevice(devices, rawMac);
            const now = Date.now();

            if (!device) {
              const fallbackKey = String(Math.abs(normMac.split(':').reduce((acc, part) => acc + parseInt(part || '0', 16), 0) * 31) % 9000 + 1000);
              device = {
                mac: normMac,
                key: key || fallbackKey,
                playlists: [],
                registeredAt: now,
                trialExpiresAt: now + (7 * 24 * 60 * 60 * 1000),
                activated: false,
                active: false
              };
            } else {
              // Dispositivo já existe: NUNCA reseta o período de teste na reinstalação!
              if (!device.registeredAt) {
                device.registeredAt = device.createdAt || now;
              }
              if (!device.trialExpiresAt) {
                device.trialExpiresAt = device.registeredAt + (7 * 24 * 60 * 60 * 1000);
              }
              if (key) {
                device.key = key;
              }
              device.mac = normMac;
            }

            devices[normMac] = device;
            devices[cleanMac] = device;
            if (rawMac && rawMac.toUpperCase() !== normMac && rawMac.toUpperCase() !== cleanMac) {
              devices[rawMac.toUpperCase()] = device;
            }

            saveDevices(devices);
            console.log(`[API] Dispositivo registrado/atualizado: MAC ${normMac} | KEY ${device.key} | Ativado: ${device.activated} | Expira: ${new Date(device.trialExpiresAt).toISOString()}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, device }));
            return;
          }

                   // 2. Validação de Login do Portal
          if (pathname === '/api/device/validate' || pathname === '/api/device/login') {
            let existing = findDevice(devices, rawMac);
            const now = Date.now();

            if (!existing) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Dispositivo nao encontrado. Por favor, abra o aplicativo Vion Player na sua TV primeiro para registrar o aparelho.'
              }));
              return;
            } else if (existing.key && key && existing.key !== key) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'Device Key incorreta! Verifique os digitos exibidos na tela do seu aplicativo.'
              }));
              return;
            } else if (!existing.key && key) {
              existing.key = key;
              devices[normMac] = existing;
              devices[cleanMac] = existing;
              saveDevices(devices);
            }

            console.log(`[Portal Login] Acesso AUTORIZADO para MAC: ${normMac}`);         res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              device: existing,
              playlists: existing.playlists || []
            }));
            return;
          }

          // Para gerenciar playlists, garante que o dispositivo existe
          let targetDevice = findDevice(devices, rawMac);
          if (!targetDevice) {
            const fallbackKey = String(Math.abs(normMac.split(':').reduce((acc, part) => acc + parseInt(part || '0', 16), 0) * 31) % 9000 + 1000);
            const now = Date.now();
            targetDevice = {
              mac: normMac,
              key: fallbackKey,
              playlists: [],
              registeredAt: now,
              trialExpiresAt: now + (7 * 24 * 60 * 60 * 1000)
            };
            devices[normMac] = targetDevice;
            devices[cleanMac] = targetDevice;
          }
          if (!Array.isArray(targetDevice.playlists)) {
            targetDevice.playlists = [];
          }

          if (pathname === '/api/device/playlist') {
            const playlist = payload.playlist;
            if (!playlist || !playlist.url) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'Playlist inválida' }));
              return;
            }

            const existingIdx = targetDevice.playlists.findIndex(p => p.id === playlist.id);
            if (existingIdx !== -1) {
              targetDevice.playlists[existingIdx] = playlist;
            } else {
              targetDevice.playlists.push(playlist);
            }

            devices[normMac] = targetDevice;
            devices[cleanMac] = targetDevice;
            saveDevices(devices);

            console.log(`[API] Playlist adicionada para MAC ${normMac}: ${playlist.name}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, playlists: targetDevice.playlists }));
            return;
          }

          if (pathname === '/api/device/delete-playlist') {
            const id = payload.id;
            targetDevice.playlists = targetDevice.playlists.filter(p => p.id !== id);

            devices[normMac] = targetDevice;
            devices[cleanMac] = targetDevice;
            saveDevices(devices);

            console.log(`[API] Playlist ${id} removida para MAC ${normMac}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, playlists: targetDevice.playlists }));
            return;
          }

          if (pathname === '/api/device/clear') {
            targetDevice.playlists = [];

            devices[normMac] = targetDevice;
            devices[cleanMac] = targetDevice;
            saveDevices(devices);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, playlists: [] }));
            return;
          }

          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Ação não encontrada' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }
  }

  // ===================================================================
  // 2. SERVIR ARQUIVOS ESTÁTICOS DO PORTAL WEB (/portal)
  // ===================================================================
  if (pathname === '/portal') {
    res.writeHead(301, { 'Location': '/portal/' });
    res.end();
    return;
  }

  if (pathname.startsWith('/portal/')) {
    let subPath = pathname.replace(/^\/portal/, '');
    if (subPath === '/' || subPath === '') subPath = '/index.html';
    const filePath = path.join(ROOT_PORTAL, subPath);

    serveStaticFile(res, filePath, subPath);
    return;
  }

  // ===================================================================
  // 3. ROTAS DO PLAYER TV / WEB APP (/tv, /app, /player)
  // ===================================================================
  if (pathname === '/tv' || pathname === '/app' || pathname === '/player') {
    res.writeHead(301, { 'Location': pathname + '/' });
    res.end();
    return;
  }

  if (pathname.startsWith('/tv/') || pathname.startsWith('/app/') || pathname.startsWith('/player/')) {
    let subPath = pathname.replace(/^\/(tv|app|player)/, '');
    if (subPath === '/' || subPath === '') subPath = '/index.html';
    const filePath = path.join(ROOT_PLAYER, subPath);
    serveStaticFile(res, filePath, subPath);
    return;
  }

  // ===================================================================
  // 4. SERVIR ARQUIVOS DO PORTAL NA RAIZ (/)
  // ===================================================================
  if (pathname === '/' || pathname === '') {
    serveStaticFile(res, path.join(ROOT_PORTAL, 'index.html'), '/index.html');
    return;
  }

  let reqFile = pathname;
  const filePath = path.join(ROOT_PLAYER, reqFile);

  if (!fs.existsSync(filePath)) {
    const portalFallback = path.join(ROOT_PORTAL, reqFile);
    if (fs.existsSync(portalFallback) && fs.statSync(portalFallback).isFile()) {
      serveStaticFile(res, portalFallback, reqFile);
      return;
    }
  }

  serveStaticFile(res, filePath, reqFile);
});

function serveStaticFile(res, filePath, publicPath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('Arquivo não encontrado: ' + publicPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Vion TV Server] Servidor ativo em http://0.0.0.0:${PORT}`);
  console.log(`[Vion Portal] Acesso ao portal em http://192.168.1.197:${PORT}/portal`);
  console.log(`[Vion Player] Acesso ao player em http://192.168.1.197:${PORT}/`);
});

}); // End of downloadStateFromFirebase wrapper
