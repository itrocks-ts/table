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
	if (!/^\/[a-z-]+\/(?:[a-z-]+\/)*[a-z-]+\.(?:css|js)$/.test(path)) { response.writeHead(404).end(); return }
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
			header.innerHTML = '<span>Name</span><input value="Search">'
			const originalWidth = header.getBoundingClientRect().width
			addition.highlight('name')
			const greenVisible = getComputedStyle(header).fontSize !== '0px'
				&& getComputedStyle(header.querySelector('input')).display !== 'none'
			const greenWidthStable = Math.abs(header.getBoundingClientRect().width - originalWidth) < 1
			const greenDuration = getComputedStyle(header).animationDuration
			await new Promise(resolve => setTimeout(resolve, 400))
			const greenCleared = !header.classList.contains('column-add-highlight')
			const started = performance.now()
			const beforeRemoval = header.getBoundingClientRect().width
			const removal = addition.remove('name')
			const removalStart = header.getBoundingClientRect().width
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
			return { greenVisible, greenWidthStable, beforeRemoval, removalStart, elapsed: performance.now() - started, fadesImmediately, greenCleared, greenDuration,
				redDuration, removed, remaining: document.querySelectorAll('th, td').length }
		})
		assert.equal(result.greenDuration, reducedMotion === 'reduce' ? '0s' : '0.35s')
		assert.equal(result.redDuration, reducedMotion === 'reduce' ? '0s' : '0.3s')
		if (reducedMotion === 'reduce') assert.ok(Math.abs(result.beforeRemoval - result.removalStart) < 1)
		assert.equal(result.greenCleared, true)
		assert.equal(result.greenVisible, true)
		assert.equal(result.greenWidthStable, true)
		assert.equal(result.fadesImmediately, true)
		assert.equal(result.removed, true)
		assert.equal(result.remaining, 0)
		assert.ok(result.elapsed >= 280 && result.elapsed < 650, JSON.stringify(result))
		console.log('PASS 350 ms addition and 300 ms removal flashes', reducedMotion, JSON.stringify(result))
		if (reducedMotion === 'no-preference') for (const layout of ['table', 'list']) for (const grouped of [false, true]) {
			await page.goto(`http://127.0.0.1:${server.address().port}/`)
			const widths = await page.evaluate(async ({ grouped, layout }) => {
				const { Table } = await import('/table/table.js')
				const { TableColumnAdd } = await import('/table/column-add.js')
				const { TableColumnReorder } = await import('/table/column-reorder.js')
				const { TableFreeze } = await import('/table/freeze.js')
				const { TableFreezeInheritBorder } = await import('/table/freeze/inherit-border.js')
				const element = document.querySelector('table')
				element.tHead.rows[0].insertCell().outerHTML = '<th data-freeze>Actions</th>'
				element.tBodies[0].rows[0].insertCell().textContent = 'Open'
				element.tHead.rows[0].cells[0].dataset.freeze = ''
				element.tHead.rows[0].insertCell(1).outerHTML = '<th>Existing</th>'
				element.tBodies[0].rows[0].insertCell(1).textContent = 'Existing value'
				element.classList.add('itrocks')
				element.style.cssText = 'border-collapse:collapse;width:600px'
				if (layout === 'list') {
					element.classList.add('objects')
					const link = document.createElement('link')
					link.rel = 'stylesheet'
					link.href = '/list/list.css'
					document.head.append(link)
					await new Promise(resolve => { link.onload = resolve })
				}
				const style = document.createElement('style')
				style.textContent = 'th,td {padding:8px;white-space:nowrap;border:1px solid gray}'
				document.head.append(style)
				if (grouped) {
					const group = document.createElement('colgroup')
					group.append(document.createElement('col'), document.createElement('col'), document.createElement('col'))
					group.firstElementChild.dataset.freeze = ''
					group.lastElementChild.dataset.freeze = ''
					element.prepend(group)
				}
				const table = new Table(element, { plugins: [TableFreeze, TableFreezeInheritBorder, TableColumnReorder, TableColumnAdd] })
				const addition = table.plugins.TableColumnAdd
				const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
				const content = text => ({
					header: Object.assign(document.createElement('th'), { innerHTML: text ? 'Metric<input name="search.metric">' : 'Metric' }),
					cells: [Object.assign(document.createElement('td'), { innerHTML: `<a>${text}</a>` })]
				})
				let load
				const transaction = addition.begin({ id: 'metric', create: () => content(''),
					load: () => new Promise(resolve => { load = resolve }) })
				transaction.moveTo(1)
				transaction.commit()
				const width = () => element.tHead.rows[0].cells[1].getBoundingClientRect().width
				const initial = width()
				await pause(30)
				const opening = width()
				const hidden = getComputedStyle(element.tHead.rows[0].cells[1]).fontSize === '0px'
				const header = element.tHead.rows[0].cells[1]

				load(content('A considerably longer value than the initial heading for this metric'))
				await pause(30)
				const retargeted = width()
				await pause(350)
				const final = width()
				const visible = getComputedStyle(element.tHead.rows[0].cells[1]).fontSize !== '0px'
				const removal = addition.remove('metric')
				await pause(30)
				const closing = width()
				await pause(100)
				const closingEnd = width()
				await removal
				const clean = !element.querySelector('td > div, th > div')
					&& element.style.cssText === 'border-collapse: collapse; width: 600px;'
				return { initial, opening, retargeted, final, closing, closingEnd, clean, hidden, visible }
			}, { grouped, layout })
			assert.ok(widths.initial < 10, JSON.stringify(widths))
			assert.ok(widths.opening > 2 && widths.opening < widths.final, JSON.stringify(widths))
			assert.ok(widths.retargeted > widths.opening && widths.retargeted < widths.final, JSON.stringify(widths))
			assert.ok(widths.closing > 2 && widths.closing < widths.final, JSON.stringify(widths))
			assert.ok(widths.closingEnd < widths.closing, JSON.stringify(widths))
			assert.equal(widths.clean, true, JSON.stringify(widths))
			assert.equal(widths.hidden, true)
			assert.equal(widths.visible, true)
			console.log('PASS animated async widths', { grouped, layout, ...widths })
		}
		if (reducedMotion === 'no-preference') for (const delay of [0, 150, 420]) {
			await page.goto(`http://127.0.0.1:${server.address().port}/`)
			const flash = await page.evaluate(async delay => {
				const { Table } = await import('/table/table.js')
				const { TableColumnAdd } = await import('/table/column-add.js')
				const { TableColumnReorder } = await import('/table/column-reorder.js')
				const table = new Table(document.querySelector('table'), { plugins: [TableColumnReorder, TableColumnAdd] })
				const addition = table.plugins.TableColumnAdd
				const content = text => ({
					header: Object.assign(document.createElement('th'), { textContent: 'Metric' }),
					cells: [Object.assign(document.createElement('td'), { textContent: text })]
				})
				let load
				const started = performance.now()
				await addition.add({ id: 'metric', create: () => content('\u00a0'),
					load: () => new Promise(resolve => { load = resolve }) })
				const header = () => table.element.tHead.rows[0].cells[1]
				const green = getComputedStyle(header()).backgroundColor
				const space = table.element.tBodies[0].rows[0].lastElementChild.textContent === '\u00a0'
				await new Promise(resolve => setTimeout(resolve, delay))
				const held = header().classList.contains('column-add-highlight')
					&& getComputedStyle(header()).animationName === 'none'
					&& getComputedStyle(header()).backgroundColor === green
				const elapsed = performance.now() - started
				load(content('Loaded value'))
				await new Promise(resolve => setTimeout(resolve, 0))
				const duration = parseFloat(header().style.getPropertyValue('--column-fade'))
				await new Promise(resolve => setTimeout(resolve, duration + 40))
				const revealed = !header().classList.contains('column-add-highlight')
				return { duration, elapsed, held, revealed, space }
			}, delay)
			assert.equal(flash.held, true, JSON.stringify(flash))
			assert.equal(flash.space, true)
			assert.ok(Math.abs(flash.duration - Math.max(100, 350 - flash.elapsed)) < 25, JSON.stringify(flash))
			assert.equal(flash.revealed, true)
			console.log('PASS green hold and remaining fade', { delay, ...flash })
		}
		for (const frozen of [false, true]) {
			await page.goto(`http://127.0.0.1:${server.address().port}/`)
			const result = await page.evaluate(async frozen => {
				const { Table } = await import('/table/table.js')
				const { TableColumnAdd } = await import('/table/column-add.js')
				const { TableColumnReorder } = await import('/table/column-reorder.js')
				const { TableFreeze } = await import('/table/freeze.js')
				const element = document.querySelector('table')
				const scroll = document.createElement('div')
				scroll.style.cssText = 'width:400px;overflow:auto'
				element.before(scroll)
				scroll.append(element)
				element.style.cssText = 'width:max-content;border-collapse:collapse'
				element.tHead.rows[0].insertCell().outerHTML = '<th data-column-id="existing">Existing</th>'
				element.tBodies[0].rows[0].insertCell().textContent = 'Existing value'
				if (frozen) {
					element.tHead.rows[0].insertCell().outerHTML = '<th data-freeze>Actions</th>'
					element.tBodies[0].rows[0].insertCell().textContent = 'Open'
				}
				const style = document.createElement('style')
				style.textContent = 'th,td {min-width:180px;padding:8px;white-space:nowrap}'
				document.head.append(style)
				const table = new Table(element, { plugins: [TableFreeze, TableColumnReorder, TableColumnAdd] })
				const addition = table.plugins.TableColumnAdd
				const content = text => ({
					header: Object.assign(document.createElement('th'), { innerHTML: 'Metric<input>' }),
					cells: [Object.assign(document.createElement('td'), { textContent: text })]
				})
				let load
				const transaction = addition.begin({ id: 'metric', create: () => content('\u00a0'),
					load: () => new Promise(resolve => { load = resolve }) })
				transaction.commit()
				const header = transaction.header
				const beforeReveal = scroll.scrollLeft
				const immediate = {
					fullWidth: header.getBoundingClientRect().width >= 196,
					green: header.classList.contains('column-add-highlight'),
					opening: header.classList.contains('column-add-opening'),
					text: getComputedStyle(header).fontSize !== '0px',
					filter: getComputedStyle(header.querySelector('input')).display !== 'none',
					space: element.tBodies[0].rows[0].cells[header.cellIndex].textContent === '\u00a0'
				}
				addition.reveal('metric')
				const revealed = scroll.scrollLeft > beforeReveal
				// Values make the final column wider, requiring another scroll after the initial reveal.
				load(content('A loaded value '.repeat(6)))
				await transaction.ready
				const loadedAt = performance.now()
				const from = scroll.scrollLeft
				const target = scroll.scrollWidth - scroll.clientWidth
				const samples = []
				while (performance.now() - loadedAt < 150) {
					await new Promise(resolve => requestAnimationFrame(resolve))
					samples.push({ elapsed: performance.now() - loadedAt, left: scroll.scrollLeft })
				}
				const final = scroll.scrollLeft
				// The same path needs no additional animation when it is already at the right edge.
				addition.scrollToEnd()
				const noExtraFrame = addition.scrollFrame === undefined
				return { immediate, revealed, from, target, samples, final, noExtraFrame }
			}, frozen)
			assert.deepEqual(result.immediate, {
				fullWidth: true, green: true, opening: false, text: true, filter: true, space: true
			})
			assert.equal(result.revealed, true)
			assert.ok(Math.abs(result.final - result.target) <= 1, JSON.stringify(result))
			assert.equal(result.noExtraFrame, true)
			if (reducedMotion === 'no-preference') {
				assert.ok(result.target > result.from + 20, JSON.stringify(result))
				assert.ok(result.samples.some(sample => sample.left > result.from && sample.left < result.target - 1),
					JSON.stringify(result))
				assert.ok(result.samples.find(sample => Math.abs(sample.left - result.target) <= 1)?.elapsed <= 130,
					JSON.stringify(result))
			}
			console.log('PASS full-width append and 100 ms loaded scroll', { frozen, reducedMotion })
		}
		await page.close()
	}
}
finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
}
