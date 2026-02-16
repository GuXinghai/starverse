import { createApp } from 'vue'
import 'katex/dist/katex.min.css'
import './style.css'
import App from './App.vue'

async function logRendererBuildId() {
	if (!(import.meta as any).env?.DEV) return
	try {
		const res = await fetch('/build-id.json', { cache: 'no-store' })
		if (!res.ok) {
			console.warn(`[build] renderer build id fetch failed: ${res.status}`)
			return
		}
		const data = await res.json()
		const buildId = typeof data?.buildId === 'string' ? data.buildId : 'unknown'
		console.info(`[build] renderer build id: ${buildId}`)
	} catch (err) {
		console.warn('[build] renderer build id fetch error:', err)
	}
}

createApp(App).mount('#app')
void logRendererBuildId()
