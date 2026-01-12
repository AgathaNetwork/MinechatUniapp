// notify.js
// 连接/notify WebSocket并处理通知
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let currentOnNotify = null;

function getToken() {
  // 假设token存储在localStorage
  try {
    const t = uni.getStorageSync('token') || '';
    console.log('[notify] getToken ->', t && t.slice ? t.slice(0,8)+'...' : t);
    return t;
  } catch (e) {
    console.warn('[notify] getToken error', e);
    return '';
  }
}

function connectNotifySocket(onNotify) {
  currentOnNotify = onNotify;
  try {
    if (socket) {
      try { socket.close(); } catch (e) {}
      socket = null;
    }

    const token = getToken();
    // 固定后端 host，参考桌面端实现，优先使用 socket.io-client
    const wsBase = 'https://front-dev.agatha.org.cn';
    console.log('[notify] attempting socket.io connect to', wsBase, 'auth.token=', token ? 'yes' : 'no');
    try {
      const io = require && typeof require === 'function' ? require('socket.io-client') : (typeof window !== 'undefined' ? window.io : null);
      if (io) {
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
        console.log('[notify] socket.io-client initialized');
        // socket will be a Socket instance (socket.io)
        // reuse existing event handlers below by branching on available APIs
        socket.on('connect', () => {
          console.log('[notify] socket connect');
          reconnectAttempts = 0;
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        });
        socket.on('disconnect', (reason) => {
          console.warn('[notify] socket disconnect', reason);
          scheduleReconnect();
        });
        socket.on('connect_error', (err) => {
          console.warn('[notify] socket connect_error', err);
          if (!socket || !socket.connected) {
            try { socket && socket.close(); } catch (e) {}
            socket = null;
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => { reconnectTimer = null; try { connectNotifySocket(onNotify); } catch (e) { console.error('[notify] reconnect error', e); } }, 5000);
            }
          }
        });
        socket.on('notify.message', (payload) => {
          try { if (typeof onNotify === 'function') onNotify(payload); } catch (e) {}
        });
        return;
      }
    } catch (e) {
      console.warn('[notify] socket.io-client init failed', e);
    }

    // 回退：使用原生 WebSocket（使用固定的 wss 地址）
    try {
      const wsUrl = `${wsBase.replace(/^http/, 'ws')}/api/notify?token=${encodeURIComponent(token)}`;
      console.log('[notify] fallback connecting to', wsUrl);
      socket = new WebSocket(wsUrl);
    } catch (e) {
      console.warn('[notify] fallback WebSocket failed', e);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      console.log('[notify] socket open');
      // 连接成功，重置重试计数
      reconnectAttempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    socket.onclose = (ev) => {
      console.warn('[notify] socket closed', ev && ev.code, ev && ev.reason);
      scheduleReconnect();
    };

    socket.onerror = (ev) => {
      console.warn('[notify] socket error', ev);
      // 尝试关闭并等待 onclose 触发重连
      try { socket.close(); } catch (e) {}
    };

    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.event === 'notify.message' && typeof onNotify === 'function') {
          onNotify(data.payload);
        }
      } catch (e) {
        // ignore
      }
    };
  } catch (e) {
    console.warn('[notify] connect exception', e);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  try {
    reconnectAttempts = Math.max(1, reconnectAttempts + 1);
    const base = 3000; // 3s
    const maxDelay = 30000; // 30s
    const delay = Math.min(Math.floor(base * Math.pow(1.5, reconnectAttempts - 1)), maxDelay);
    console.log('[notify] schedule reconnect in', delay, 'ms (attempt', reconnectAttempts, ')');
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      try { connectNotifySocket(currentOnNotify); } catch (e) { scheduleReconnect(); }
    }, delay);
  } catch (e) {
    // ignore
  }
}

export function startNotifyListener() {
  connectNotifySocket((payload) => {
    // 调用系统通知
    if (payload && payload.message) {
      console.log('[notify] got notification', payload);
      const title = payload.message.content?.text || '你有新消息';
      const options = {
        body: `来自会话 ${payload.chatId}`,
        icon: '/static/logo.png',
      };
      // #ifdef H5
      if (window.Notification && Notification.permission === 'granted') {
        new Notification(title, options);
      } else if (window.Notification && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification(title, options);
          }
        });
      }
      // #endif
      // #ifdef APP-PLUS
      plus.nativeUI.createNotification({
        title,
        content: options.body,
        icon: options.icon
      }).show();
      // #endif
    }
  });
}

export function setTokenAndReconnect(token) {
  try {
    if (typeof token === 'string') {
      uni.setStorageSync('token', token);
    }
  } catch (e) {}
  try {
    console.log('[notify] setTokenAndReconnect called with', token && token.slice ? token.slice(0,8)+'...' : token);
    // 强制重新连接以使用新的 token
    if (socket) {
      try { socket.close(); } catch (e) {}
      socket = null;
    }
    reconnectTimer && clearTimeout(reconnectTimer);
    // reset attempts to try immediately
    reconnectAttempts = 0;
    connectNotifySocket(currentOnNotify);
  } catch (e) { console.warn('[notify] setTokenAndReconnect error', e); }
}
