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
		response.end(`<!doctype html><style>
			table { border-collapse: separate; border-spacing: 0 }
			th, td { min-width: 150px; background: white }
		</style><div><table><thead><tr>
			<th data-freeze>Select</th><th data-freeze>Identity</th>
			<th data-column-id="name">Name</th><th data-column-id="value">Value</th>
		</tr></thead><tbody><tr><td>Select</td><td>Identity</td><td>Name</td><td>Value</td></tr></tbody></table></div>`)
		return
	}
	if (!/^\/[a-z-]+\/(?:[a-z-]+\/)*[a-z-]+\.js$/.test(path)) { response.writeHead(404).end(); return }
	try {
		response.setHeader('Content-Type', 'text/javascript')
		response.end(await readFile(new URL(`../..${path}`, import.meta.url)))
	}
	catch { response.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
	browser = await chromium.launch({ chromiumSandbox: true, headless: true })
	for (const grouped of [false, true]) for (const selfScrolling of [false, true]) {
		const page = await browser.newPage({ reducedMotion: 'reduce' })
		await page.goto(`http://127.0.0.1:${server.address().port}/`)
		const result = await page.evaluate(async ({ grouped, selfScrolling }) => {
			const { Table } = await import('/table/table.js')
			const { TableColumnAdd } = await import('/table/column-add.js')
			const { TableColumnReorder } = await import('/table/column-reorder.js')
			const { TableFreeze } = await import('/table/freeze.js')
			const element = document.querySelector('table')
			const scroll = selfScrolling ? element : element.parentElement
			scroll.style.cssText = 'width:480px;overflow:auto'
			if (selfScrolling) element.style.display = 'block'
			if (grouped) {
				const group = document.createElement('colgroup')
				for (let index = 0; index < 4; index ++) {
					const col = document.createElement('col')
					if (index < 2) col.dataset.freeze = ''
					group.append(col)
				}
				element.prepend(group)
			}
			const table = new Table(element, { plugins: [TableColumnReorder, TableFreeze, TableColumnAdd] })
			const addition = table.plugins.TableColumnAdd
			const positions = () => [...element.rows].map(row => [...row.cells].slice(0, 2)
				.map(cell => cell.getBoundingClientRect().left))
			const before = positions()
			scroll.scrollLeft = 120
			const scrolled = positions()
			let loaded
			const content = text => ({
				header: Object.assign(document.createElement('th'), { textContent: 'Metric' }),
				cells: [Object.assign(document.createElement('td'), { textContent: text })]
			})
			await addition.add({ id: 'metric', create: () => content(''),
				load: () => new Promise(resolve => { loaded = resolve }) })
			const added = positions()
			loaded(content('Loaded value'))
			await new Promise(resolve => setTimeout(resolve, 400))
			const afterLoad = positions()
			scroll.scrollLeft = 0
			const returned = positions()
			await addition.remove('metric')
			return { before, scrolled, added, afterLoad, returned, removed: positions() }
		}, { grouped, selfScrolling })
		for (const phase of ['scrolled', 'added', 'afterLoad', 'returned', 'removed']) {
			assert.deepEqual(result[phase], result.before, JSON.stringify({ grouped, selfScrolling, phase, result }))
		}
		console.log('PASS frozen columns survive addition and values after horizontal scrolling', { grouped, selfScrolling })
		await page.close()
	}
}
finally {
	await browser?.close()
	await new Promise(resolve => server.close(resolve))
}
