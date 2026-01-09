<template>
	<view class="page" :class="{ dark: isDark }">
		<web-view :src="url" :webview-styles="webviewStyles" />
	</view>
</template>

<script>
export default {
	data() {
		const targetUrl = 'https://front-dev.agatha.org.cn/'
		return {
			targetUrl,
			url: '',
			statusBarHeight: 0,
			isDark: false,
			webviewStyles: {
				cachemode: 'cacheElseNetwork'
			}
		}
	},
	onLoad() {
		// #ifndef APP-PLUS
		// 非 App 端无需处理 cookie，直接加载
		this.url = this.targetUrl
		// #endif
	},
	onReady() {
		// #ifdef APP-PLUS
		this.statusBarHeight = (uni.getSystemInfoSync && uni.getSystemInfoSync().statusBarHeight) || 0
		this.isDark = this.detectDarkMode()
		this.applyStatusBarStyle()
		this.restoreCookiesAndLoad()
		this.applyChildWebviewStyles()
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
		this.url = this.targetUrl
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
								top: `${this.statusBarHeight || 0}px`,
								bottom: '0px',
								background: bg,
								webviewBGTransparent: true
							})
						}
					} catch (e) {
						// ignore
					}
				}, 200)
			} catch (e) {
				// ignore
			}
		}
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
