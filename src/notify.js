// Mobile notify.js for MinechatUniapp
// 提供 startNotifyListener() 与 setTokenAndReconnect(token)
let socket = null;
let reconnectTimer = null;
let onNotifyCallback = null;
let currentToken = '';

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
    try { socket.close(); } catch (e) {}
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
  try {
    io = require('socket.io-client');
  } catch (e) {
    logDebug('[notify] require socket.io-client failed: ' + (e?.message || e));
    console.error('[notify] require socket.io-client failed', e);
    return;
  }

  try {
    socket = io(wsBase, {
      path: '/api/notify',
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      secure: true,
    });
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
      try { socket && socket.close(); } catch (e) {}
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
    if (socket) {
      try {
        // update auth and reconnect
        socket.auth = { token: t };
        socket.disconnect();
        socket.connect();
        logDebug('[notify] socket reconnected with new token');
        return;
      } catch (e) {
        logDebug('[notify] setTokenAndReconnect reconnect error: ' + (e?.message || e));
        try { socket.close(); } catch (e) {}
        socket = null;
      }
    }
    // if no socket, create one using existing onNotifyCallback
    connectNotifySocket(onNotifyCallback);
  } catch (e) { console.error('[notify] setTokenAndReconnect error', e); }
}

export { startNotifyListener, setTokenAndReconnect };
