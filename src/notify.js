// notify.js (refactored clean)
let socket = null
let reconnectTimer = null
let reconnectAttempts = 0
let currentOnNotify = null
let tokenPollTimer = null
let lastTokenSeen = ''
let socketConnectWatchTimer = null

function safeGetStorageToken() {
  try {
    if (typeof uni !== 'undefined' && uni.getStorageSync) {
      const t = uni.getStorageSync('token')
      if (t) {
        try { console.log('[notify] safeGetStorageToken found token (uni)', t && t.slice ? t.slice(0,8)+'...' : t) } catch(e){}
        return String(t)
      }
    }
  } catch (e) {}
  try {
    if (typeof plus !== 'undefined' && plus.storage && plus.storage.getItem) {
      const t = plus.storage.getItem('token')
      if (t) {
        try { console.log('[notify] safeGetStorageToken found token (plus.storage)', t && t.slice ? t.slice(0,8)+'...' : t) } catch(e){}
        return String(t)
      }
    }
  } catch (e) {}
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      const t = localStorage.getItem('token')
      if (t) {
        try { console.log('[notify] safeGetStorageToken found token (localStorage)', t && t.slice ? t.slice(0,8)+'...' : t) } catch(e){}
        return String(t)
      }
    }
  } catch (e) {}
  return ''
}

function writeStorageToken(t) {
  try { if (typeof uni !== 'undefined' && uni.setStorageSync) uni.setStorageSync('token', String(t)) } catch (e) {}
  try { if (typeof plus !== 'undefined' && plus.storage && plus.storage.setItem) plus.storage.setItem('token', String(t)) } catch (e) {}
  try { if (typeof localStorage !== 'undefined' && localStorage.setItem) localStorage.setItem('token', String(t)) } catch (e) {}
}

function scheduleReconnect() {
  try {
    reconnectAttempts = Math.max(1, reconnectAttempts + 1)
    const base = 3000
    const maxDelay = 30000
    const delay = Math.min(Math.floor(base * Math.pow(1.5, reconnectAttempts - 1)), maxDelay)
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      try { connectNotifySocket(currentOnNotify) } catch (e) { scheduleReconnect() }
    }, delay)
  } catch (e) {}
}

function handleIncomingNotify(payload) {
  try {
    if (payload && payload.message) {
      const title = payload.message.content && payload.message.content.text ? payload.message.content.text : '你有新消息'
      const body = payload.chatId ? `来自会话 ${payload.chatId}` : ''
      try {
        if (typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') {
          new Notification(title, { body })
        } else if (typeof window !== 'undefined' && window.Notification && Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title, { body }) })
        }
      } catch (e) {}
      try {
        if (typeof plus !== 'undefined' && plus.nativeUI && plus.nativeUI.createNotification) {
          plus.nativeUI.createNotification({ title, content: body }).show()
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function connectNotifySocket(onNotify) {
  currentOnNotify = onNotify
  try {
    const token = safeGetStorageToken() || ''
    try { console.log('[notify] connectNotifySocket, token present?', token ? 'yes' : 'no') } catch(e){}

    if (socket) {
      try { socket.close && socket.close() } catch (e) {}
      socket = null
    }

    const wsBase = 'https://front-dev.agatha.org.cn'
    // try socket.io-client if available
    try {
      const io = (typeof require === 'function') ? require('socket.io-client') : (typeof window !== 'undefined' ? window.io : null)
      try { console.log('[notify] socket.io-client available?', !!io) } catch(e){}
      if (io) {
        // follow PC implementation: create socket with auth and rely on connect_error to schedule retry
        try { console.log('[notify] attempting socket.io connect (auth) to', wsBase) } catch(e){}
        socket = io(wsBase, {
          path: '/api/notify',
          transports: ['websocket'],
          auth: { token },
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          secure: true,
        })

        socket.on('connect', () => {
          reconnectTimer && clearTimeout(reconnectTimer)
          reconnectTimer = null
          try {
            console.log('[notify] socket connect')
          } catch (e) {}
        })

        socket.on('disconnect', (reason) => {
          try { console.warn('[notify] socket disconnect', reason) } catch(e){}
        })

        socket.on('connect_error', (err) => {
          try { console.warn('[notify] socket connect_error', err) } catch (e) {}
          if (!socket || !socket.connected) {
            try { socket && socket.close() } catch (e) {}
            socket = null
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = null
                try { connectNotifySocket(onNotify) } catch (e) { try { console.error('[notify] reconnect error', e) } catch(e){} }
              }, 5000)
            }
          }
        })

        socket.on('notify.message', (payload) => { try { if (typeof onNotify === 'function') onNotify(payload); handleIncomingNotify(payload) } catch (e) {} })
        return
      }
    } catch (e) {}

    // fallback native WebSocket
    try {
      const wsUrl = `${wsBase.replace(/^http/, 'ws')}/api/notify?token=${encodeURIComponent(token)}`
      socket = new WebSocket(wsUrl)
    } catch (e) { scheduleReconnect(); return }

    socket.onopen = () => { reconnectAttempts = 0; if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null } }
    socket.onclose = () => { scheduleReconnect() }
    socket.onerror = () => { try { socket.close && socket.close() } catch (e) {} }
    socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        if (data && data.event === 'notify.message') {
          if (typeof onNotify === 'function') onNotify(data.payload)
          handleIncomingNotify(data.payload)
        }
      } catch (e) {}
    }
  } catch (e) { scheduleReconnect() }
}

export function startNotifyListener(onNotify) {
  try {
    if (typeof onNotify === 'function') currentOnNotify = onNotify

    // start polling storage for token changes
    try {
      if (tokenPollTimer) clearInterval(tokenPollTimer)
      lastTokenSeen = safeGetStorageToken() || ''
      tokenPollTimer = setInterval(() => {
        try {
          const t = safeGetStorageToken() || ''
          if (t && t !== lastTokenSeen) {
            try { console.log('[notify] tokenPoll detected new token', t && t.slice ? t.slice(0,8)+'...' : t) } catch(e){}
            lastTokenSeen = t
            try { setTokenAndReconnect(t) } catch (e) {}
          }
        } catch (e) {}
      }, 1500)
    } catch (e) {}

    // listen for window.postMessage tokens (H5 login page)
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('message', function (ev) {
          try {
            const data = ev && ev.data
            if (data && data.type === 'minechat-token' && data.token) {
              try { setTokenAndReconnect(String(data.token)) } catch (e) {}
            }
          } catch (e) {}
        }, false)
      }
    } catch (e) {}

    // initial connect attempt
    connectNotifySocket(currentOnNotify)
  } catch (e) {}
}

export function setTokenAndReconnect(newToken) {
  try {
    if (typeof newToken === 'string') writeStorageToken(newToken)
    try { console.log('[notify] setTokenAndReconnect called with token', newToken && newToken.slice ? newToken.slice(0,8)+'...' : newToken) } catch(e){}
  } catch (e) {}
  try {
    reconnectAttempts = 0
    if (socket) { try { socket.close && socket.close() } catch (e) {} socket = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    connectNotifySocket(currentOnNotify)
  } catch (e) {}
}

export function stopNotifyListener() {
  try {
    if (tokenPollTimer) { clearInterval(tokenPollTimer); tokenPollTimer = null }
    if (socket) { try { socket.close && socket.close() } catch (e) {} socket = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (socketConnectWatchTimer) { clearTimeout(socketConnectWatchTimer); socketConnectWatchTimer = null }
  } catch (e) {}
}

export default { startNotifyListener, setTokenAndReconnect, stopNotifyListener }