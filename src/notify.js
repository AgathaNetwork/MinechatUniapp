// Mobile notify.js for MinechatUniapp
// 提供 startNotifyListener() 与 setTokenAndReconnect(token)
let socket = null;
let reconnectTimer = null;
let onNotifyCallback = null;
let currentToken = '';

function safeCloseSocket(s) {
  if (!s) return;
  try {
    if (typeof s.disconnect === 'function') return s.disconnect();
  } catch (e) {}
  try {
    if (typeof s.close === 'function') return s.close();
  } catch (e) {}
}

function logDebug(msg) {
  try {
    const key = 'notify-debug';
    const arr = (uni.getStorageSync(key) || []);
    arr.push({ t: Date.now(), msg });
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    uni.setStorageSync(key, arr);
  } catch (e) {}
  console.log('[notify]', msg);
}

async function getToken() {
  try {
    const t = uni.getStorageSync('token');
    return (t || '').trim();
  } catch (e) {
    return '';
  }
}

async function connectNotifySocket(onNotify) {
  onNotifyCallback = onNotify || onNotifyCallback;
  if (socket) {
    safeCloseSocket(socket);
    socket = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const token = await getToken();
  currentToken = token;
  const wsBase = 'https://front-dev.agatha.org.cn';
  logDebug(`[notify] socket create: ${wsBase} path=/api/notify auth.token=${token ? 'yes' : 'no'}`);

  let io;
  // #ifdef H5
  try {
    io = require('socket.io-client');
    if (io && io.io) io = io.io;
    logDebug('[notify] using socket.io-client (H5)');
  } catch (e) {
    logDebug('[notify] require socket.io-client failed: ' + (e?.message || e));
    console.error('[notify] require socket.io-client failed', e);
    return;
  }
  // #endif

  // #ifndef H5
  try {
    io = require('@hyoga/uni-socket.io');
    if (io && io.io) io = io.io;
    logDebug('[notify] using @hyoga/uni-socket.io (non-H5)');
  } catch (e) {
    logDebug('[notify] require @hyoga/uni-socket.io failed: ' + (e?.message || e));
    console.error('[notify] require @hyoga/uni-socket.io failed', e);
    return;
  }
  // #endif

  try {
    // 说明：
    // - 后端实际是 path '/notify'；这里使用 '/api/notify' 以便走 front-dev 的反代重写。
    // - uni-app 下官方 socket.io-client 常因缺少 XHR/WebSocket 全局实现而失败；适配包会使用 uni.request/uni.connectSocket。
    // - token 同时放在 auth 与 query，避免某些端不支持 auth。
    const options = {
      path: '/api/notify',
      auth: { token },
      query: { token },
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    };

    // #ifdef H5
    // 浏览器端允许 polling 作为降级
    options.transports = ['websocket', 'polling'];
    options.upgrade = true;
    // #endif

    // #ifndef H5
    // App/小程序端优先 websocket，避免 polling 兼容性差异
    options.transports = ['websocket'];
    options.upgrade = false;
    // #endif

    socket = io(wsBase, options);
  } catch (e) {
    logDebug('[notify] socket create error: ' + (e?.message || e));
    console.error('[notify] socket create error', e);
    return;
  }

  socket.on('connect', () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    logDebug('[notify] socket connect');
    console.log('[notify] socket connect');
  });

  socket.on('disconnect', (reason) => {
    logDebug('[notify] socket disconnect: ' + reason);
    console.log('[notify] socket disconnect', reason);
  });

  socket.on('connect_error', (err) => {
    logDebug('[notify] socket connect_error: ' + (err?.message || err));
    console.log('[notify] socket connect_error', err);
    if (!socket || !socket.connected) {
      safeCloseSocket(socket);
      socket = null;
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          try { connectNotifySocket(onNotifyCallback); } catch (e) { console.error('[notify] reconnect error', e); }
        }, 5000);
      }
    }
  });

  socket.on('notify.message', (payload) => {
    try { if (typeof onNotifyCallback === 'function') onNotifyCallback(payload); } catch (e) {}
  });
}

function showMobileNotification(title, body) {
  try {
    const text = (body && String(body)) || '';
    if (uni && uni.showToast) {
      uni.showToast({ title: title || 'Minechat', icon: 'none', duration: 3000 });
    }
    try { if (uni && uni.vibrateShort) uni.vibrateShort(); } catch (e) {}
    logDebug('[notify] showMobileNotification: ' + (title || '') + ' / ' + text);
  } catch (e) {}
}

function startNotifyListener() {
  const onNotify = (payload) => {
    try {
      logDebug('[notify] payload: ' + JSON.stringify(payload || {}));
      if (payload && payload.message) {
        const msg = payload.message || {};
        const content = msg.content;
        let messageText = '';
        if (typeof content === 'string') messageText = content;
        else if (content && typeof content === 'object') messageText = content.text || content.body || JSON.stringify(content);
        else messageText = '';

        const title = payload.chatName || (payload.chat && payload.chat.name) || `会话 ${payload.chatId}`;
        showMobileNotification(title, messageText);
      }
    } catch (e) { console.warn('[notify] onNotify error', e); }
  };

  connectNotifySocket(onNotify);
}

function setTokenAndReconnect(token) {
  try {
    const t = String(token || '');
    uni.setStorageSync('token', t);
    currentToken = t;
    logDebug('[notify] setTokenAndReconnect token set');
    // uni-app 各端对“动态更新 auth 并 reconnect”的支持不一致，直接重建连接最稳。
    try {
      safeCloseSocket(socket);
    } catch (e) {}
    socket = null;
    connectNotifySocket(onNotifyCallback);
  } catch (e) { console.error('[notify] setTokenAndReconnect error', e); }
}

export { startNotifyListener, setTokenAndReconnect };
