import assert                 from 'node:assert/strict'
import { test }               from 'node:test'
import { TableColumnAdd }     from '../column-add.js'
import { TableColumnReorder } from '../column-reorder.js'

function fixture()
{
	const listeners = []
	const events = []
	const makeCell = (name, tagName = 'TD') => {
		const classes = new Set()
		const attributes = new Map()
		return {
			name, tagName, colSpan: 1, rowSpan: 1, dataset: {}, parentElement: null,
			classList: {
				add: name => classes.add(name), contains: name => classes.has(name),
				remove: name => classes.delete(name),
				toggle: (name, value) => value ? classes.add(name) : classes.delete(name)
			},
			get cellIndex() { return this.parentElement?.cells.indexOf(this) ?? -1 },
			setAttribute: (key, value) => attributes.set(key, value),
			removeAttribute: key => attributes.delete(key),
			getAttribute: key => attributes.get(key),
			remove() {
				if (!this.parentElement) return
				this.parentElement.cells.splice(this.cellIndex, 1)
				this.parentElement = null
			},
			replaceWith(cell) { this.before(cell); this.remove() },
			before(cell) { this.parentElement.insertBefore(cell, this) },
			after(cell) { this.parentElement.insertBefore(cell, this.parentElement.cells[this.cellIndex + 1]) }
		}
	}
	const makeRow = (names, tag) => {
		const row = { cells: [], insertBefore(cell, before) {
			cell.remove()
			const index = before ? this.cells.indexOf(before) : this.cells.length
			this.cells.splice(index, 0, cell)
			cell.parentElement = this
		} }
		for (const name of names) row.insertBefore(makeCell(name, tag))
		return row
	}
	const rows = [makeRow(['a', 'b'], 'TH'), makeRow(['A1', 'B1']), makeRow(['A2', 'B2'])]
	for (const cell of rows[0].cells) cell.dataset.columnId = cell.name
	const element = { parentElement: null, rows, tHead: { rows: [rows[0]] }, querySelector: () => null, querySelectorAll: () => [] }
	const reorder = new TableColumnReorder()
	const addition = new TableColumnAdd({ onChange: change => events.push(change) })
	reorder.scrollContainer = () => undefined
	const table = { element, onReset: listeners, refreshStyleSheets() {}, plugins: { TableColumnReorder: reorder } }
	addition.of = reorder.of = table
	addition.init()
	const content = label => ({ header: makeCell(label, 'TH'), cells: [makeCell(label + '1'), makeCell(label + '2')] })
	return { addition, content, events, rows, reset: () => { for (const listener of listeners) listener() } }
}

function deferred()
{
	let resolve, reject
	const promise = new Promise((yes, no) => { resolve = yes; reject = no })
	return { promise, reject, resolve }
}

test('asynchronous values replace placeholders after a distinct commit and rapid clicks deduplicate', async () => {
	const f = fixture()
	try {
		const data = deferred()
		let creates = 0
		const source = { id: 'opaque.id/7', create: () => { creates ++; return f.content('pending') },
			load: () => data.promise }
		assert.deepEqual(await Promise.all([f.addition.add(source), f.addition.add(source)]), ['added', 'existing'])
		assert.equal(creates, 1)
		assert.deepEqual(f.events.map(event => event.state), ['provisional', 'committed'])
		assert.equal(f.rows[0].cells[2].classList.contains('column-add-provisional'), false)
		assert.equal(f.rows[1].cells[2].getAttribute('aria-busy'), 'true')
		data.resolve(f.content('loaded'))
		await data.promise
		await Promise.resolve()
		assert.deepEqual(f.rows.map(row => row.cells[2].name), ['loaded', 'loaded1', 'loaded2'])
		assert.deepEqual(f.events.map(event => event.state), ['provisional', 'committed', 'loaded'])
	}
	finally { f.reset() }
})

test('cancel aborts an uncooperative load and prevents late DOM resurrection', async () => {
	const f = fixture()
	const data = deferred()
	let signal
	const operation = f.addition.begin({ id: 'cancel', create: () => f.content('pending'),
		load: abort => { signal = abort; return data.promise } })
	assert.equal(operation.state, 'provisional')
	operation.cancel()
	operation.cancel()
	assert.equal(signal.aborted, true)
	data.resolve(f.content('late'))
	await operation.ready
	assert.deepEqual(f.rows.map(row => row.cells.length), [2, 2, 2])
	assert.deepEqual(f.events.map(event => event.state), ['provisional', 'cancelled'])
	assert.throws(() => operation.commit(), /cancelled/)
	f.reset()
})

test('existing transactions reuse the column and cancel restores its position without a removal', () => {
	const f = fixture()
	const operation = f.addition.begin({ id: 'a', create: () => assert.fail('Existing column must be reused') })
	operation.moveTo(1)
	assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['b', 'a'])
	operation.cancel()
	assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['a', 'b'])
	assert.deepEqual(f.events.map(event => event.state), ['cancelled'])
	f.reset()
})

test('failed values remain committed and retry loads them without another addition', async () => {
	const f = fixture()
	try {
		let calls = 0
		const source = { id: 'retry', create: () => f.content('pending'), load: async () => {
			if (calls ++ === 0) throw new Error('Unavailable')
			return f.content('retried')
		} }
		assert.equal(await f.addition.add(source), 'added')
		await Promise.resolve()
		assert.equal(f.rows[0].cells[2].classList.contains('column-add-error'), true)
		await f.addition.retry('retry')
		assert.equal(f.rows[0].cells[2].name, 'retried')
		assert.equal(f.events.filter(event => event.state === 'committed').length, 1)
	}
	finally { f.reset() }
})

test('invalid creation leaves no column and teardown ignores late values', async () => {
	const f = fixture()
	await assert.rejects(f.addition.add({ id: 'bad', create: () => ({ header: f.content('bad').header, cells: [] }) }),
		/match/)
	assert.deepEqual(f.rows.map(row => row.cells.length), [2, 2, 2])
	const data = deferred()
	let signal
	await f.addition.add({ id: 'dispose', create: () => f.content('pending'),
		load: abort => { signal = abort; return data.promise } })
	f.reset()
	assert.equal(signal.aborted, true)
	data.resolve(f.content('late'))
	await data.promise
	await Promise.resolve()
	assert.equal(f.rows[0].cells[2].name, 'pending')
	await assert.rejects(f.addition.add({ id: 'later', create: () => f.content('no') }), /disposed/)
})

test('a changed row view rejects stale loaded data and retains a visible recoverable error', async () => {
	const f = fixture()
	const data = deferred()
	const operation = f.addition.begin({ id: 'view', create: () => f.content('pending'), load: () => data.promise })
	operation.commit()
	f.rows.pop()
	data.resolve(f.content('stale'))
	await operation.ready
	assert.equal(operation.header.name, 'pending')
	assert.equal(operation.header.classList.contains('column-add-error'), true)
	assert.equal(f.events.at(-1).state, 'error')
	f.reset()
})

function externalFixture()
{
	const f = fixture()
	const names = ['document', 'requestAnimationFrame', 'cancelAnimationFrame']
	const globals = names.map(name => globalThis[name])
	globalThis.document = { documentElement: { classList: { add() {}, remove() {} } } }
	globalThis.requestAnimationFrame = () => 1
	globalThis.cancelAnimationFrame = () => {}
	const table = f.addition.of
	table.element.isConnected = true
	table.element.getBoundingClientRect = () => ({ left: 0, right: 400, top: 100, bottom: 400 })
	const decorate = cell => {
		cell.getBoundingClientRect = () => ({ left: cell.cellIndex * 100, right: (cell.cellIndex + 1) * 100 })
		return cell
	}
	for (const row of f.rows) for (const cell of row.cells) decorate(cell)
	const content = label => {
		const result = f.content(label)
		for (const cell of [result.header, ...result.cells]) decorate(cell)
		return result
	}
	return { ...f, content, restore: () => {
		f.addition.dispose()
		names.forEach((name, index) => {
			if (globals[index] === undefined) delete globalThis[name]
			else globalThis[name] = globals[index]
		})
	} }
}
const point = (clientX, clientY = 150) => ({ clientX, clientY, pointerId: 42, pointerType: 'mouse' })

test('external drop commits before values and loads only once across movement', async () => {
	const f = externalFixture()
	try {
		const values = deferred()
		let loads = 0
		const drag = f.addition.beginExternal({ id: 'new', create: () => f.content('pending'),
			load: () => {
				loads ++
				return values.promise
			} }, point(250))
		for (const x of [180, 120, 210, 150]) drag.move(point(x))
		assert.equal(await drag.finish(point(50)), 'added')
		assert.equal(loads, 1)
		assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['pending', 'a', 'b'])
		assert.equal(f.events.filter(event => event.state === 'committed').length, 1)
		values.resolve(f.content('loaded'))
		await new Promise(resolve => setImmediate(resolve))
		assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['loaded', 'a', 'b'])
	}
	finally { f.restore() }
})

test('external existing movement cancels outside and never calls header deletion', async () => {
	const f = externalFixture()
	try {
		const reorder = f.addition.of.plugins.TableColumnReorder
		reorder.options.onRemove = () => assert.fail('External drag removed a column')
		const source = { id: 'a', create: () => assert.fail('Existing column recreated') }
		const moved = f.addition.beginExternal(source, point(600))
		moved.move(point(180))
		assert.equal(await moved.finish(point(180)), 'moved')
		assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['b', 'a'])
		for (const destination of [point(50, 50), point(50, 500), point(-20), point(600)]) {
			const drag = f.addition.beginExternal(source, point(150))
			drag.move(point(50))
			assert.equal(await drag.finish(destination), 'cancelled')
			assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['b', 'a'])
		}
	}
	finally { f.restore() }
})

test('external admission failure and disposal discard provisional and late values', async () => {
	for (const action of ['cancel', 'dispose', 'reject']) {
		const f = externalFixture()
		try {
			const values = deferred()
			const admission = deferred()
			const drag = f.addition.beginExternal({ id: 'new', create: () => f.content('pending'),
				load: () => values.promise, accept: () => admission.promise }, point(250))
			const finished = action === 'reject' ? drag.finish(point(150)) : undefined
			if (action === 'cancel') drag.cancel()
			if (action === 'dispose') f.addition.dispose()
			if (action === 'reject') {
				admission.reject(new Error('Not supported'))
				await assert.rejects(finished, /Not supported/)
			}
			else admission.resolve()
			values.resolve(f.content('late'))
			await new Promise(resolve => setImmediate(resolve))
			assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['a', 'b'])
			assert.equal(f.events.filter(event => event.state === 'committed').length, 0)
			assert.equal(f.events.filter(event => event.state === 'cancelled').length, 1)
		}
		finally { f.restore() }
	}
})

test('external data failure is retryable after a valid drop and does not control acceptance', async () => {
	const f = externalFixture()
	try {
		let attempt = 0
		const drag = f.addition.beginExternal({ id: 'new', create: () => f.content('pending'), load: async () => {
			if (!attempt ++) throw new Error('Values failed')
			return f.content('retried')
		} }, point(250))
		await new Promise(resolve => setImmediate(resolve))
		assert.equal(await drag.finish(point(150)), 'added')
		await f.addition.retry('new')
		assert.equal(f.rows[0].cells.some(cell => cell.name === 'retried'), true)
		assert.equal(f.events.filter(event => event.state === 'committed').length, 1)
	}
	finally { f.restore() }
})
