import assert           from 'node:assert/strict'
import { readFile }     from 'node:fs/promises'
import { createServer } from 'node:http'

const runtime = process.env.PS_PLAYWRIGHT_MODULE
	|| '/home/baptiste/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(runtime)
const server = createServer(async (request, response) => {
	const path = new URL(request.url, 'http://localhost').pathname
	if (path === '/') {
		response.setHeader('Content-Type', 'text/html')
		response.end(`<!doctype html><link rel="stylesheet" href="/table/column-add.css">
			<table><thead><tr><th data-column-id="name">Name</th></tr></thead>
			<tbody><tr><td>Example</td></tr></tbody></table>`)
		return
	}
	if (!/^\/[a-z-]+\/[a-z-]+\.(?:css|js)$/.test(path)) { response.writeHead(404).end(); return }
	try {
		response.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript')
		response.end(await readFile(new URL(`../..${path}`, import.meta.url)))
	}
	catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	for (const reducedMotion of ['no-preference', 'reduce']) {
		const page = await browser.newPage({ reducedMotion })
		await page.goto(`http://127.0.0.1:${server.address().port}/`)
		const result = await page.evaluate(async () => {
			const { Table } = await import('/table/table.js')
			const { TableColumnAdd } = await import('/table/column-add.js')
			const { TableColumnReorder } = await import('/table/column-reorder.js')
			const table = new Table(document.querySelector('table'), { plugins: [TableColumnReorder, TableColumnAdd] })
			const addition = table.plugins.TableColumnAdd
			const header = document.querySelector('th')
			addition.highlight('name')
			const greenDuration = getComputedStyle(header).animationDuration
			await new Promise(resolve => setTimeout(resolve, 400))
			const greenCleared = !header.classList.contains('column-add-highlight')
			const started = performance.now()
			const removal = addition.remove('name')
			const redDuration = getComputedStyle(header).animationDuration
			const animation = header.getAnimations()[0]
			let fadesImmediately = true
			if (animation) {
				animation.pause()
				animation.currentTime = 0
				const initial = getComputedStyle(header).backgroundColor
				animation.currentTime = 30
				fadesImmediately = getComputedStyle(header).backgroundColor !== initial
				animation.play()
			}
			const removed = await removal
			return { elapsed: performance.now() - started, fadesImmediately, greenCleared, greenDuration,
				redDuration, removed, remaining: document.querySelectorAll('th, td').length }
		})
		assert.equal(result.greenDuration, reducedMotion === 'reduce' ? '0s' : '0.35s')
		assert.equal(result.redDuration, reducedMotion === 'reduce' ? '0s' : '0.35s')
		assert.equal(result.greenCleared, true)
		assert.equal(result.fadesImmediately, true)
		assert.equal(result.removed, true)
		assert.equal(result.remaining, 0)
		assert.ok(result.elapsed >= 320 && result.elapsed < 650, JSON.stringify(result))
		console.log('PASS matching 350 ms flashes', reducedMotion, JSON.stringify(result))
		await page.close()
	}
}
finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
}
