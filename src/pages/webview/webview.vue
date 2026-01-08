<template>
	<web-view :src="url" :webview-styles="webviewStyles" />
</template>

<script>
export default {
	data() {
		const targetUrl = 'https://front-dev.agatha.org.cn/'
		return {
			targetUrl,
			url: '',
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
		this.restoreCookiesAndLoad()
		this.applyChildWebviewCacheMode()
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
		applyChildWebviewCacheMode() {
			try {
				const currentWebview = this.$scope.$getAppWebview()
				setTimeout(() => {
					try {
						const child = currentWebview && currentWebview.children && currentWebview.children()[0]
						child && child.setStyle && child.setStyle({ cachemode: 'cacheElseNetwork' })
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
</style>
