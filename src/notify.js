// Mobile notify.js for MinechatUniapp
// 提供 startNotifyListener() 与 setTokenAndReconnect(token)
let socket = null;
let reconnectTimer = null;
let onNotifyCallback = null;
let currentToken = '';
let appForeground = true;
let appStateInited = false;
let pushRegisterInFlight = false;
let pushRegisterTimer = null;
let pushRegisterDelayMs = 1500;
let pushRegisterLastAttemptAt = 0;
let pushRegisterLastOkAt = 0;
let networkListenerInited = false;

const WS_BASE = 'https://front-dev.agatha.org.cn';

function getApiBase() {
  // front-dev 上通常会把 /api 反代到后端
  return WS_BASE + '/api';
}

function maskCid(cid) {
  const s = String(cid || '').trim();
  if (!s) return '';
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function getRegisteredCidFromStorage() {
  try {
    const raw = uni.getStorageSync('unipush-cid-registered');
    if (!raw) return '';
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object' && raw.cid) return String(raw.cid).trim();
  } catch (e) {}
  return '';
}

function setRegisteredCidToStorage(cid) {
  try {
    uni.setStorageSync('unipush-cid-registered', { cid: String(cid || '').trim(), at: Date.now(), apiBase: getApiBase() });
  } catch (e) {
    try { uni.setStorageSync('unipush-cid-registered', String(cid || '').trim()); } catch (e2) {}
  }
}

function clearRegisteredCidStorage() {
  try { uni.removeStorageSync('unipush-cid-registered'); } catch (e) {}
}

function stopCidRegisterLoop() {
  if (pushRegisterTimer) {
    try { clearTimeout(pushRegisterTimer); } catch (e) {}
    pushRegisterTimer = null;
  }
}

function scheduleCidRegisterLoop(reason) {
  stopCidRegisterLoop();
  const delay = Math.max(800, Math.min(60_000, pushRegisterDelayMs || 1500));
  logDebug(`[notify] scheduleCidRegisterLoop: delay=${delay}ms reason=${reason}`);
  pushRegisterTimer = setTimeout(() => {
    pushRegisterTimer = null;
    try { registerUniPushCidOnce(reason); } catch (e) {}
  }, delay);
}

function kickCidRegisterLoop(reason) {
  // 强制快速尝试一次（但仍避免过于频繁）
  pushRegisterDelayMs = 1500;
  scheduleCidRegisterLoop(reason);
}

function initNetworkTrackingOnce() {
  if (networkListenerInited) return;
  networkListenerInited = true;
  try {
    if (uni && typeof uni.onNetworkStatusChange === 'function') {
      uni.onNetworkStatusChange((res) => {
        try {
          const isConnected = !!(res && res.isConnected);
          logDebug('[notify] network change: isConnected=' + isConnected + ' type=' + (res && res.networkType));
          if (isConnected) {
            kickCidRegisterLoop('networkRestored');
          }
        } catch (e) {}
      });
    }
  } catch (e) {}
}

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

function initAppStateTrackingOnce() {
  if (appStateInited) return;
  appStateInited = true;
  try {
    // #ifdef APP-PLUS
    try {
      if (typeof plus !== 'undefined' && plus.runtime && typeof plus.runtime.isApplicationForeground === 'function') {
        appForeground = !!plus.runtime.isApplicationForeground();
      }
    } catch (e) {}
    // #endif

    if (uni && typeof uni.onAppShow === 'function') {
      uni.onAppShow(() => {
        appForeground = true;
        // 回到前台后 push cid 可能才就绪/网络才恢复
        kickCidRegisterLoop('appShow');
        // 某些 Android 机型后台会冻结 JS/断开网络栈，回前台时主动重连更稳。
        try {
          if (!socket || !socket.connected) {
            connectNotifySocket(onNotifyCallback);
          }
        } catch (e) {}
      });
    }
    if (uni && typeof uni.onAppHide === 'function') {
      uni.onAppHide(() => { appForeground = false; });
    }
  } catch (e) {}
}

function getForegroundState() {
  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.runtime && typeof plus.runtime.isApplicationForeground === 'function') {
      return !!plus.runtime.isApplicationForeground();
    }
  } catch (e) {}
  // #endif
  return !!appForeground;
}

function showSystemNotification(title, body, payload) {
  const t = title || 'Minechat';
  const text = (body && String(body)) || '';

  // #ifdef APP-PLUS
  try {
    if (typeof plus !== 'undefined' && plus.push && typeof plus.push.createMessage === 'function') {
      // createMessage: content, payload, options
      const p = payload ? JSON.stringify(payload) : '';
      plus.push.createMessage(text || '你有新消息', p, { title: t });
      logDebug('[notify] showSystemNotification(APP-PLUS): ' + t + ' / ' + text);
      return true;
    }
    logDebug('[notify] showSystemNotification(APP-PLUS) unavailable: plus.push.createMessage not found');
  } catch (e) {
    logDebug('[notify] showSystemNotification(APP-PLUS) error: ' + (e?.message || e));
  }
  return false;
  // #endif

  // #ifdef H5
  try {
    if (typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        const n = new Notification(t, { body: text || '你有新消息' });
        try {
          n.onclick = () => {
            try { window && window.focus && window.focus(); } catch (e) {}
          };
        } catch (e) {}
        logDebug('[notify] showSystemNotification(H5): ' + t + ' / ' + text);
        return true;
      }
      if (Notification.permission === 'default') {
        // 非用户手势下可能会被浏览器拒绝；这里尽力请求一次。
        Notification.requestPermission().catch(() => {});
      }
    }
  } catch (e) {
    // fallthrough
  }
  return false;
  // #endif
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
  const wsBase = WS_BASE;
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
    // 连接成功时也触发一次 cid 注册兜底（若之前没成功）
    kickCidRegisterLoop('socketConnect');
  });

  socket.on('disconnect', (reason) => {
    logDebug('[notify] socket disconnect: ' + reason);
    console.log('[notify] socket disconnect', reason);
    // 断联时继续尝试注册（用户希望断联后也能走离线推送）
    kickCidRegisterLoop('socketDisconnect');
  });

  socket.on('connect_error', (err) => {
    logDebug('[notify] socket connect_error: ' + (err?.message || err));
    console.log('[notify] socket connect_error', err);
    kickCidRegisterLoop('socketConnectError');
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

async function getUniPushCidAppPlus() {
  // #ifdef APP-PLUS
  try {
    if (typeof plus === 'undefined' || !plus.push) return '';
    // plus.push.getClientInfo().clientid
    const info = plus.push.getClientInfo && plus.push.getClientInfo();
    const cid = info && (info.clientid || info.clientId || info.cid);
    return String(cid || '').trim();
  } catch (e) {
    return '';
  }
  // #endif
  return '';
}

async function registerUniPushCidOnce(reason) {
  // #ifdef APP-PLUS
  try {
    if (pushRegisterInFlight) return;
    pushRegisterInFlight = true;

    const now = Date.now();
    if (now - pushRegisterLastAttemptAt < 800) return;
    pushRegisterLastAttemptAt = now;

    const token = await getToken();
    if (!token) {
      logDebug('[notify] registerUniPushCid skipped: missing token (reason=' + reason + ')');
      // 没 token 时也持续重试，等登录后即可自动注册
      pushRegisterDelayMs = Math.min(10_000, Math.floor((pushRegisterDelayMs || 1500) * 1.5));
      scheduleCidRegisterLoop('missingToken');
      return;
    }

    let cid = await getUniPushCidAppPlus();
    if (!cid) {
      // 有些机型启动后 clientid 会延迟就绪，稍微重试
      for (let i = 0; i < 10 && !cid; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
        // eslint-disable-next-line no-await-in-loop
        cid = await getUniPushCidAppPlus();
      }
    }
    if (!cid) {
      logDebug('[notify] registerUniPushCid skipped: missing cid (reason=' + reason + ')');
      pushRegisterDelayMs = Math.min(10_000, Math.floor((pushRegisterDelayMs || 1500) * 1.5));
      scheduleCidRegisterLoop('missingCid');
      return;
    }

    const registered = getRegisteredCidFromStorage();
    if (registered === cid && pushRegisterLastOkAt > 0) {
      // 已确认注册成功，停止循环
      stopCidRegisterLoop();
      return;
    }

    let platform = '';
    try {
      const sys = uni.getSystemInfoSync && uni.getSystemInfoSync();
      platform = (sys && (sys.platform || sys.osName || sys.system)) || '';
    } catch (e) {}

    let appId = '';
    try {
      if (typeof plus !== 'undefined' && plus.runtime && plus.runtime.appid) appId = String(plus.runtime.appid);
    } catch (e) {}

    const url = getApiBase() + '/users/me/push/register';
    logDebug('[notify] registerUniPushCid POST ' + url + ' cid=' + maskCid(cid) + ' reason=' + reason);

    await new Promise((resolve, reject) => {
      uni.request({
        url,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        data: { cid, platform, appId },
        success: (res) => {
          if (res && res.statusCode >= 200 && res.statusCode < 300) return resolve(res);
          let hint = '';
          try {
            const d = res && res.data;
            hint = d ? (' body=' + JSON.stringify(d).slice(0, 300)) : '';
          } catch (e) {}
          return reject(new Error('register cid failed: status=' + (res && res.statusCode) + hint));
        },
        fail: (err) => reject(err)
      });
    });

    // 注册成功：写入“已确认注册”的标记并停止重试
    setRegisteredCidToStorage(cid);
    pushRegisterLastOkAt = Date.now();
    pushRegisterDelayMs = 1500;
    stopCidRegisterLoop();
    logDebug('[notify] registerUniPushCid ok cid=' + maskCid(cid));
  } catch (e) {
    logDebug('[notify] registerUniPushCid error: ' + (e?.message || e));
    // 失败则指数退避继续尝试
    pushRegisterDelayMs = Math.min(60_000, Math.floor((pushRegisterDelayMs || 1500) * 1.8));
    scheduleCidRegisterLoop('retryAfterError');
  } finally {
    pushRegisterInFlight = false;
  }
  // #endif
}

function startCidRegisterLoop() {
  // #ifdef APP-PLUS
  // 启动一次循环：未成功时会自动退避重试；成功后停止。
  // 每次启动都会先安排一次快速尝试。
  kickCidRegisterLoop('start');
  // #endif
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
  initAppStateTrackingOnce();
  initNetworkTrackingOnce();
  // App-Plus：尽早上报 UniPush cid，便于后端离线推送
  try { startCidRegisterLoop(); } catch (e) {}
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
        const foreground = getForegroundState();
        logDebug(`[notify] decide notify channel: foreground=${foreground} (flag=${appForeground})`);

        // #ifdef APP-PLUS
        // App-Plus：无论前后台都尝试发系统通知；仅在前台再补一个 toast。
        const ok = showSystemNotification(title, messageText, payload);
        logDebug('[notify] system notify dispatched=' + ok);
        if (foreground) {
          // showMobileNotification(title, messageText);
        } else if (!ok) {
          // 系统通知失败时（极少数机型/权限问题），至少留一条日志
          logDebug('[notify] system notify failed while background');
        }
        // #endif

        // #ifndef APP-PLUS
        // 其他平台：前台 toast，后台尽力系统通知
        if (foreground) {
          // showMobileNotification(title, messageText);
        } else {
          const ok2 = showSystemNotification(title, messageText, payload);
          logDebug('[notify] system notify dispatched=' + ok2);
          // if (!ok2) showMobileNotification(title, messageText);
        }
        // #endif
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
    // token 更新后强制重试注册（可能是首次登录）
    try {
      clearRegisteredCidStorage();
      pushRegisterLastOkAt = 0;
      startCidRegisterLoop();
    } catch (e) {}
    // uni-app 各端对“动态更新 auth 并 reconnect”的支持不一致，直接重建连接最稳。
    try {
      safeCloseSocket(socket);
    } catch (e) {}
    socket = null;
    connectNotifySocket(onNotifyCallback);
  } catch (e) { console.error('[notify] setTokenAndReconnect error', e); }
}

export { startNotifyListener, setTokenAndReconnect };
