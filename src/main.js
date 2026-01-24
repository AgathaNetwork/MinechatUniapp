
import Vue from 'vue'
import App from './App'
import './uni.promisify.adaptor'
import { startNotifyListener } from './notify'
import { setTokenAndReconnect } from './notify'
import { startAndroidKeepAliveService } from './keepAlive'

Vue.config.productionTip = false


App.mpType = 'app'


const app = new Vue({
  ...App
})
app.$mount()

// 启动通知监听
startNotifyListener();

// #ifdef APP-PLUS
// Android：启动前台常驻服务（开机自启由原生 BootReceiver 触发，这里是运行期兜底）
try { startAndroidKeepAliveService(); } catch (e) {}
// #endif

// 在 H5 / 浏览器 环境中，监听来自子页面的 postMessage（登录页会尝试 postMessage）
try {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('message', (ev) => {
      try {
        console.log('[main] window.message received', ev && ev.data)
        const data = ev && ev.data
        if (data && data.type === 'minechat-token' && data.token) {
          try { console.log('[main] received token via postMessage, calling setTokenAndReconnect', data.token && data.token.slice ? data.token.slice(0,8)+'...' : data.token) } catch (e) {}
          try { setTokenAndReconnect(String(data.token)); } catch (e) { console.warn('[main] setTokenAndReconnect failed', e); }
        }
      } catch (e) {
        console.warn('[main] message handler error', e)
      }
    }, false)
  }
} catch (e) {
  // ignore
}
