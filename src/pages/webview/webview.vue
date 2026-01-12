<template>
	<view class="page" :class="{ dark: isDark }">
		<web-view :src="url" :webview-styles="webviewStyles" @message="onWebviewMessage" />
	</view>
</template>

<script>
import buildInfo from '../../build-info.json'
import { setTokenAndReconnect } from '../../notify'

export default {
	data() {
		const targetUrl = 'https://front-dev.agatha.org.cn/'
		return {
			targetUrl,
			url: '',
			isDark: false,
			webviewStyles: {
				cachemode: 'cacheElseNetwork'
			}
		}
	},
	onLoad() {
		// #ifndef APP-PLUS
		// 非 App 端无需处理 cookie，直接加载
		this.url = this.buildWebviewUrl()
		// #endif
	},
	onReady() {
		// #ifdef APP-PLUS
		this.isDark = this.detectDarkMode()
		this.applyStatusBarStyle()
		this.restoreCookiesAndLoad()
		this.applyChildWebviewStyles()
			// Start a short-lived debug poll to log current stored token for diagnostics
			try {
				this._mc_debug_count = 0
				this._mc_debug_timer = setInterval(() => {
					try {
						const t = uni.getStorageSync('token') || ''
						console.log('[webview-debug] uni.getStorageSync(\'token\') ->', t && t.slice ? t.slice(0,8)+'...' : t)
					} catch (e) { console.warn('[webview-debug] getStorageSync failed', e) }
					this._mc_debug_count++
					if (this._mc_debug_count >= 6) {
						clearInterval(this._mc_debug_timer)
						this._mc_debug_timer = null
					}
				}, 2000)
			} catch (e) {}
		// #endif
	},
	onHide() {
		// #ifdef APP-PLUS
		this.persistCookies()
		// #endif
	},
	onUnload() {
		// #ifdef APP-PLUS
		this.persistCookies()
		// #endif
	},
	methods: {
		buildWebviewUrl() {
			try {
				const t = this.targetUrl || ''
				const bt = buildInfo && (buildInfo.buildTimeIso || buildInfo.buildTime) ? (buildInfo.buildTimeIso || buildInfo.buildTime) : ''
				if (!bt) return t
				const sep = t.includes('?') ? '&' : '?'
				return `${t}${sep}mc_app_build_time=${encodeURIComponent(String(bt))}`
			} catch (e) {
				return this.targetUrl
			}
		},
		injectBuildInfoToChildWebview() {
			try {
				// #ifdef APP-PLUS
				const bt = buildInfo && (buildInfo.buildTimeIso || buildInfo.buildTime) ? (buildInfo.buildTimeIso || buildInfo.buildTime) : ''
				if (!bt) return

				const currentWebview = this.$scope && this.$scope.$getAppWebview ? this.$scope.$getAppWebview() : null
				const child = currentWebview && currentWebview.children && currentWebview.children()[0]
				if (!child || !child.evalJS) return

				const escaped = String(bt).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
				// Inject build time and a small token-bridge helper into the child webview.
				// The helper will notify the host when localStorage.token is present or set.
				const bridgeScript = `try{(function(){window.__MC_APP_BUILD_TIME__='${escaped}';localStorage.setItem('mc_app_build_time','${escaped}');var __last='';function __forward(m){try{if(window.postMessage)window.postMessage(m,'*')}catch(e){}try{if(window.chrome&&window.chrome.webview&&window.chrome.webview.postMessage)window.chrome.webview.postMessage(m)}catch(e){}try{if(window.external&&typeof window.external.invoke==='function')window.external.invoke(JSON.stringify(m))}catch(e){}}function __check(){try{var t=localStorage.getItem('token')||''; if(t && t!==__last){__last=t; __forward({type:'minechat-token',token:t})}}catch(e){}}if(!window.__MC_TOKEN_INTERVAL__){window.__MC_TOKEN_INTERVAL__=setInterval(__check,500);}var __orig=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){try{__orig.apply(this,arguments);}catch(e){} if(String(k)==='token'){__check()}}})();}catch(e){};`
			child.evalJS(bridgeScript)
				// #endif
			} catch (e) {
				// ignore
			}
		},
		detectDarkMode() {
			try {
				const sys = uni.getSystemInfoSync ? uni.getSystemInfoSync() : null
				if (sys && typeof sys.theme === 'string') {
					return sys.theme === 'dark'
				}
			} catch (e) {
				// ignore
			}
			try {
				return typeof plus !== 'undefined' && plus.navigator && plus.navigator.getUIStyle
					? plus.navigator.getUIStyle() === 'dark'
					: false
			} catch (e) {
				return false
			}
		},
		applyStatusBarStyle() {
			try {
				// 深色背景用浅色前景（白字），浅色背景用深色前景（黑字）
				plus.navigator.setStatusBarStyle(this.isDark ? 'light' : 'dark')
			} catch (e) {
				// ignore
			}
			try {
				// 让状态栏区域背景跟随页面背景，避免顶部留白突兀
				plus.navigator.setStatusBarBackground(this.isDark ? '#333' : '#F8F8F8')
			} catch (e) {
				// ignore
			}
		},
		getPageBgColor() {
			return this.isDark ? '#333' : '#F8F8F8'
		},
		getCookieStorageKey() {
			return `persisted_cookies:${this.targetUrl}`
		},
		persistCookies() {
			try {
				const cookie = plus.navigator.getCookie(this.targetUrl) || ''
				uni.setStorageSync(this.getCookieStorageKey(), cookie)
			} catch (e) {
				// 忽略异常：不同内核/权限/实现差异可能导致失败
			}
		},
		restoreCookiesAndLoad() {
			try {
				const cookie = uni.getStorageSync(this.getCookieStorageKey()) || ''
				if (cookie) {
					// getCookie 通常返回 "a=1; b=2"，setCookie 需要 SET-COOKIE 格式
					cookie
						.split(';')
						.map((s) => s.trim())
						.filter(Boolean)
						.forEach((pair) => {
							// 兜底：强制写成持久化 cookie（无法保留 HttpOnly/SameSite 等属性）
							plus.navigator.setCookie(
								this.targetUrl,
								`${pair}; expires=Friday, 31-Dec-9999 23:59:59 GMT; path=/`
							)
						})
				}
			} catch (e) {
				// 忽略异常
			}


		// 恢复/设置完成后再加载，尽量保证首次请求就带上 cookie
		this.url = this.buildWebviewUrl()
		try {
			setTimeout(() => this.injectBuildInfoToChildWebview(), 600)
			setTimeout(() => this.injectBuildInfoToChildWebview(), 1500)
		} catch (e) {}
		},
		applyChildWebviewStyles() {
			try {
				const currentWebview = this.$scope.$getAppWebview()
				setTimeout(() => {
					try {
						const child = currentWebview && currentWebview.children && currentWebview.children()[0]
						if (child && child.setStyle) {
							const bg = this.getPageBgColor()
							child.setStyle({
								cachemode: 'cacheElseNetwork',
								top: '0px',
								bottom: '0px',
								background: bg,
								webviewBGTransparent: true
							})
							try {
								this.injectBuildInfoToChildWebview()
							} catch (e) {}
							// Start host-side polling to pull token from child localStorage
							try {
								this.startChildTokenPoll(child)
							} catch (e) {}
						}
					} catch (e) {
						// ignore
					}
				}, 200)
			} catch (e) {
				// ignore
			}
		},
		startChildTokenPoll(child) {
			try {
				if (!child || !child.evalJS) return
				// clear existing
				if (this._mc_child_token_timer) {
					clearInterval(this._mc_child_token_timer)
					this._mc_child_token_timer = null
				}
				// Try multiple bridge mechanisms from within the child page to notify host.
				const script = "try{var t=localStorage.getItem('token')||'';try{if(typeof __plusMessage!=='undefined'&&__plusMessage)try{__plusMessage({data:{type:'minechat-token',token:t}});}catch(e){} }catch(e){};try{if(window.postMessage)try{window.postMessage({type:'minechat-token',token:t},'*')}catch(e){} }catch(e){};try{if(window.parent&&window.parent!==window&&window.parent.postMessage)try{window.parent.postMessage({type:'minechat-token',token:t},'*')}catch(e){} }catch(e){};try{if(window.top&&window.top!==window&&window.top.postMessage)try{window.top.postMessage({type:'minechat-token',token:t},'*')}catch(e){} }catch(e){};try{if(window.chrome&&window.chrome.webview&&window.chrome.webview.postMessage)try{window.chrome.webview.postMessage({type:'minechat-token',token:t})}catch(e){} }catch(e){};try{if(window.external&&typeof window.external.invoke==='function')try{window.external.invoke(JSON.stringify({type:'minechat-token',token:t}))}catch(e){} }catch(e){};try{if(typeof plus!=='undefined'&&plus.storage&&plus.storage.setItem)try{plus.storage.setItem('token',t);}catch(e){} }catch(e){} }catch(e){}"
				// poll every 1000ms
				this._mc_child_token_timer = setInterval(() => {
					try {
						console.log('[webview] startChildTokenPoll: calling child.evalJS to read token')
						child.evalJS(script)
					} catch (e) {
						console.warn('[webview] startChildTokenPoll: child.evalJS failed', e)
					}
				}, 1000)
			} catch (e) {
				// ignore
			}
		},
		stopChildTokenPoll() {
			try {
				if (this._mc_child_token_timer) {
					clearInterval(this._mc_child_token_timer)
					this._mc_child_token_timer = null
				}
			} catch (e) {}
		}
		,onWebviewMessage(e) {
			try {
				console.log('[webview] onWebviewMessage event received', e && e.detail ? e.detail : e)
				let data = null
				if (e && e.detail && typeof e.detail === 'object') {
					data = e.detail.data || e.detail
				} else {
					data = e
				}
				if (typeof data === 'string') {
					try { data = JSON.parse(data) } catch (err) { console.warn('[webview] could not parse data string', err) }
				}
				console.log('[webview] parsed message data', data)
				if (data && data.type === 'minechat-token') {
					console.log('[webview] token message received', data.token && data.token.slice ? data.token.slice(0,8)+'...' : data.token)
					try { uni.setStorageSync('token', String(data.token)); console.log('[webview] stored token via uni.setStorageSync'); } catch (err) { console.warn('[webview] uni.setStorageSync failed', err) }
					try { setTokenAndReconnect(String(data.token)); console.log('[webview] called setTokenAndReconnect'); } catch (err) { console.warn('[webview] setTokenAndReconnect failed', err) }
				} else {
					console.log('[webview] ignored message (not minechat-token)')
				}
			} catch (err) {
				console.warn('[webview] onWebviewMessage handler error', err)
			}
		},
	}
}
</script>

<style>
.page {
	flex: 1;
	min-height: 100vh;
	background-color: #f8f8f8;
}

.page.dark {
	background-color: #333;
}
</style>
