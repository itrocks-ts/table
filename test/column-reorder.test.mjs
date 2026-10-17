import assert                 from 'node:assert/strict'
import { test }               from 'node:test'
import { TableColumnReorder } from '../column-reorder.js'

function classList()
{
	const classes = new Set()
	return {
		add: (...names) => names.forEach(name => classes.add(name)),
		contains: name => classes.has(name),
		remove: (...names) => names.forEach(name => classes.delete(name)),
		toggle: (name, value) => value ? classes.add(name) : classes.delete(name)
	}
}

function fixture(options = {}, names = ['select', 'name', 'email'])
{
	const globals = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']
	const previous = globals.map(name => globalThis[name])
	globalThis.document = { documentElement: { classList: classList() } }
	globalThis.requestAnimationFrame = () => 1
	globalThis.cancelAnimationFrame = () => {}
	globalThis.getComputedStyle = () => ({ overflowX: 'visible' })
	const makeRow = () => {
		const row = { cells: [] }
		row.cells = names.map(name => ({
			name,
			parentElement: row,
			classList: classList(),
			getBoundingClientRect() {
				const left = row.cells.indexOf(this) * 100
				return { left, right: left + 100, top: 100, bottom: 140 }
			},
			remove() { row.cells.splice(row.cells.indexOf(this), 1) },
			before(cell) {
				cell.remove()
				row.cells.splice(row.cells.indexOf(this), 0, cell)
			},
			after(cell) {
				cell.remove()
				row.cells.splice(row.cells.indexOf(this) + 1, 0, cell)
			},
			closest() { return this }
		}))
		return row
	}
	const rows = [makeRow(), makeRow(), makeRow()]
	const calls = []
	const element = {
		rows,
		tHead: { rows: [rows[0]] },
		parentElement: null,
		querySelectorAll: () => [],
		getBoundingClientRect: () => ({ left: 0, right: 400, top: 100, bottom: 400 }),
		setPointerCapture() {},
		hasPointerCapture: () => true,
		releasePointerCapture() {}
	}
	const reorder = new TableColumnReorder({
		isReorderable: header => header.name !== 'select',
		onRemove: header => calls.push(['remove', header.name]),
		onReorder: header => calls.push(['reorder', header.name]),
		...options
	})
	const listeners = []
	reorder.of = {
		element,
		onReset: [],
		selector: 'table.test',
		styleSheet: [],
		addEventListener: (element, type, listener, options) => listeners.push({ element, type, listener, options })
	}
	const pointer = (type, x, y = 120) => reorder.onPointer({
		type, clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true,
		target: rows[0].cells[1], preventDefault() {}
	})
	return {
		calls, element, listeners, makeRow, pointer, reorder, rows,
		restore: () => globals.forEach((name, index) => {
			if (previous[index] === undefined) delete globalThis[name]
			else globalThis[name] = previous[index]
		})
	}
}

test('auto-scroll reaches either limit with a stationary pointer at or beyond the edge', () => {
	for (const onRemove of [undefined, () => {}]) {
		for (const x of [-25, 25, 275, 325]) {
			const f = fixture({ onRemove })
			try {
				let scrollLeft = 100
				const container = {
					clientWidth: 300,
					scrollWidth: 500,
					get scrollLeft() { return scrollLeft },
					set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(200, value)) },
					getBoundingClientRect: () => ({ left: 0, right: 300 })
				}
				f.element.parentElement = container
				globalThis.getComputedStyle = element => ({ overflowX: element === container ? 'auto' : 'visible' })
				f.pointer('pointerdown', 150)
				f.pointer('pointermove', x < 150 ? 120 : 250)
				f.reorder.animate(0)
				assert.equal(f.reorder.drag.index, x < 150 ? f.reorder.drag.minimum : f.reorder.drag.maximum)
				f.pointer('pointermove', x)
				for (let time = 16; (f.reorder.frame !== undefined) && (time <= 1000); time += 16) {
					f.reorder.animate(time)
				}
				assert.equal(scrollLeft, x < 150 ? 0 : 200, `pointer at ${x}, removal ${!!onRemove}`)
				assert.equal(f.reorder.frame, undefined)
				assert.equal(f.reorder.drag.index, x < 150 ? f.reorder.drag.minimum : f.reorder.drag.maximum)
				assert.deepEqual(f.calls, [])
			}
			finally {
				f.reorder.finish(false)
				f.restore()
			}
		}
	}
})

test('an external column keeps auto-scrolling beyond the visible edge', () => {
	const f = fixture()
	try {
		let scrollLeft = 100
		const container = {
			clientWidth: 300,
			scrollWidth: 500,
			get scrollLeft() { return scrollLeft },
			set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(200, value)) },
			getBoundingClientRect: () => ({ left: 0, right: 300 })
		}
		f.element.parentElement = container
		globalThis.getComputedStyle = element => ({ overflowX: element === container ? 'auto' : 'visible' })
		const operation = f.reorder.beginExternal(f.rows[0].cells[1], {
			clientX: 325, clientY: 120, pointerId: 1, pointerType: 'mouse'
		})
		assert.equal(f.reorder.drag.remove, true)
		f.reorder.animate(0)
		f.reorder.animate(250)
		assert.equal(scrollLeft, 200)
		operation.cancel()
	}
	finally { f.reorder.finish(false); f.restore() }
})

test('an external column stays in its new position while the pointer is stationary', () => {
	const f = fixture()
	try {
		for (const row of f.rows) for (const cell of row.cells) {
			cell.getBoundingClientRect = () => {
				const left = row.cells.slice(0, row.cells.indexOf(cell))
					.reduce((width, previous) => width + (previous.name === 'name' ? 200 : 100), 0)
				return { left, right: left + (cell.name === 'name' ? 200 : 100), top: 100, bottom: 140 }
			}
		}
		const operation = f.reorder.beginExternal(f.rows[0].cells[2], {
			clientX: 250, clientY: 120, pointerId: 1, pointerType: 'mouse'
		})
		f.reorder.animate(0)
		assert.equal(f.reorder.drag.index, 1)
		f.reorder.animate(16)
		assert.equal(f.reorder.drag.index, 1)
		operation.cancel()
	}
	finally { f.reorder.finish(false); f.restore() }
})

test('columns keep moving outside either edge during removal and auto-scroll', () => {
	for (const x of [-25, 325]) {
		const f = fixture({
			isReorderable: header => !['select', 'actions'].includes(header.name)
		}, ['select', 'name', 'email', 'city', 'country', 'phone', 'actions'])
		try {
			let scrollLeft = x < 0 ? 300 : 0
			const container = {
				clientWidth: 300,
				scrollWidth: 700,
				get scrollLeft() { return scrollLeft },
				set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(400, value)) },
				getBoundingClientRect: () => ({ left: 0, right: 300 })
			}
			f.element.parentElement = container
			globalThis.getComputedStyle = element => ({ overflowX: element === container ? 'auto' : 'visible' })
			for (const row of f.rows) {
				for (const cell of row.cells) {
					cell.getBoundingClientRect = () => {
						const left = cell.name === 'select' ? 0
							: cell.name === 'actions' ? 280 : row.cells.indexOf(cell) * 100 - scrollLeft
						return { left, right: left + (cell.name === 'actions' ? 20 : 100), top: 100, bottom: 140 }
					}
				}
			}
			const header = f.rows[0].cells[x < 0 ? 4 : 1]
			const pointer = (type, clientX) => f.reorder.onPointer({
				type, clientX, clientY: 120, pointerId: 1, button: 0, isPrimary: true, target: header, preventDefault() {}
			})
			const initialOrder = f.rows[0].cells.map(cell => cell.name)
			pointer('pointerdown', 150)
			pointer('pointermove', x)
			assert.equal(f.reorder.drag.remove, true)
			f.reorder.animate(0)
			assert.equal(f.reorder.drag.index, x < 0 ? 2 : 3)
			for (let time = 16; (f.reorder.frame !== undefined) && (time <= 1000); time += 16) {
				f.reorder.animate(time)
			}
			assert.equal(scrollLeft, x < 0 ? 0 : 400)
			assert.equal(f.reorder.drag.index, x < 0 ? 1 : 5)
			assert.equal(f.reorder.drag.remove, true)
			assert.equal(header.classList.contains('removing'), true)
			assert.deepEqual(f.calls, [])
			if (x < 0) {
				pointer('pointercancel', x)
				for (const row of f.rows) assert.deepEqual(row.cells.map(cell => cell.name), initialOrder)
				assert.deepEqual(f.calls, [])
			}
			else {
				pointer('pointerup', x)
				for (const row of f.rows) assert.equal(row.cells.some(cell => cell.name === header.name), false)
				assert.deepEqual(f.calls, [['remove', header.name]])
			}
		}
		finally {
			f.reorder.finish(false)
			f.restore()
		}
	}
})

test('dropping on selection, after the data, above or below removes all column cells', () => {
	for (const [x, y] of [[50, 120], [350, 120], [150, 90], [150, 410]]) {
		const f = fixture()
		try {
			f.pointer('pointerdown', 150)
			f.pointer('pointermove', x, y)
			assert.equal(f.reorder.drag.remove, true)
			for (const row of f.rows) assert.equal(row.cells[1].classList.contains('removing'), true)
			f.rows.push(f.makeRow()) // A feed row arriving during the drag must also lose its cell.
			f.pointer('pointerup', x, y)
			for (const row of f.rows) assert.deepEqual(row.cells.map(cell => cell.name), ['select', 'email'])
			assert.deepEqual(f.calls, [['remove', 'name']])
			assert.equal(f.reorder.drag, undefined)
		}
		finally { f.restore() }
	}
})

test('returning inside clears removal and preserves normal reordering', () => {
	const f = fixture()
	try {
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 50)
		f.pointer('pointermove', 250)
		assert.equal(f.reorder.drag.remove, false)
		for (const row of f.rows) assert.equal(row.cells[1].classList.contains('removing'), false)
		f.pointer('pointerup', 250)
		for (const row of f.rows) assert.deepEqual(row.cells.map(cell => cell.name), ['select', 'email', 'name'])
		assert.deepEqual(f.calls, [['reorder', 'name']])
	}
	finally { f.restore() }
})

test('cancelling in a removal zone restores the initial order and sends no callback', () => {
	const f = fixture()
	try {
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 250)
		f.reorder.animate(0)
		f.pointer('pointermove', 50)
		f.pointer('pointercancel', 50)
		for (const row of f.rows) {
			assert.deepEqual(row.cells.map(cell => cell.name), ['select', 'name', 'email'])
			assert.equal(row.cells[1].classList.contains('removing'), false)
		}
		assert.deepEqual(f.calls, [])
	}
	finally { f.restore() }
})

test('removal stays optional for tables using only reordering', () => {
	const f = fixture({ onRemove: undefined })
	try {
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 50)
		assert.equal(f.reorder.drag.remove, false)
		f.pointer('pointerup', 50)
		assert.equal(f.rows[0].cells.length, 3)
		assert.deepEqual(f.calls, [])
	}
	finally { f.restore() }
})

test('release coordinates decide removal and the last data column can also be removed', () => {
	const f = fixture()
	try {
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 170)
		assert.equal(f.reorder.drag.remove, false)
		f.pointer('pointerup', 350)
		assert.deepEqual(f.rows[0].cells.map(cell => cell.name), ['select', 'email'])
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 50)
		f.pointer('pointerup', 50)
		for (const row of f.rows) assert.deepEqual(row.cells.map(cell => cell.name), ['select'])
		assert.deepEqual(f.calls, [['remove', 'name'], ['remove', 'email']])
	}
	finally { f.restore() }
})

test('moving changes the indicator, returning to the original position clears it, and removal takes priority', () => {
	const f = fixture()
	try {
		const cells = f.rows.map(row => row.cells[1])
		const expectState = (move, remove) => {
			for (const cell of cells) {
				assert.equal(cell.classList.contains('moving'), move)
				assert.equal(cell.classList.contains('removing'), remove)
			}
		}
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 170)
		expectState(false, false)
		f.pointer('pointermove', 250)
		f.reorder.animate(0)
		expectState(true, false)
		f.pointer('pointermove', 50)
		expectState(false, true)
		f.pointer('pointermove', 250)
		f.reorder.animate(0)
		expectState(true, false)
		f.pointer('pointermove', 150)
		f.reorder.animate(0)
		expectState(false, false)
		f.pointer('pointerup', 150)
		expectState(false, false)
		for (const cell of cells) assert.equal(cell.classList.contains('column-reorder'), false)
		assert.deepEqual(f.calls, [])
	}
	finally { f.restore() }
})

for (const pointerType of ['mouse', 'pen', 'touch']) {
	test(`${pointerType}: tap keeps sorting, dragging suppresses its click, next tap sorts`, async () => {
		const f = fixture()
		try {
			f.reorder.init()
			const pointer = (type, x, y = 120, extra = {}) => f.reorder.onPointer({
				type, clientX: x, clientY: y, pointerId: 1, pointerType, button: 0, isPrimary: true,
				target: f.rows[0].cells[1], preventDefault() {}, ...extra
			})
			let suppressed = 0
			const click = () => f.listeners.find(listener => listener.type === 'click').listener({
				preventDefault() { suppressed ++ }, stopImmediatePropagation() {}
			})
			pointer('pointerdown', 150)
			pointer('pointerup', 150)
			click()
			assert.equal(suppressed, 0)
			pointer('pointerdown', 150)
			pointer('pointermove', 250)
			pointer('pointerup', 250)
			assert.deepEqual(f.calls, [['reorder', 'name']])
			await new Promise(resolve => setTimeout(resolve, 20))
			click()
			assert.equal(suppressed, 1)
			pointer('pointerdown', 150)
			pointer('pointerup', 150)
			click()
			assert.equal(suppressed, 1)
			pointer('pointerdown', 150)
			pointer('pointermove', 150, 90)
			pointer('pointerup', 150, 90)
			assert.deepEqual(f.calls.at(-1), ['remove', 'email'])
		}
		finally { f.reorder.finish(false); f.restore() }
	})
}

test('only the primary pointer can arm a drag and other fingers cannot move or finish it', () => {
	const f = fixture()
	try {
		const pointer = (type, x, extra = {}) => f.reorder.onPointer({
			type, clientX: x, clientY: 120, pointerId: 1, button: 0, isPrimary: true,
			target: f.rows[0].cells[1], preventDefault() {}, ...extra
		})
		pointer('pointerdown', 150, { isPrimary: false, pointerId: 2 })
		assert.equal(f.reorder.press, undefined)
		pointer('pointerdown', 150)
		pointer('pointermove', 250, { isPrimary: false, pointerId: 2 })
		assert.equal(f.reorder.drag, undefined)
		pointer('pointermove', 250)
		pointer('pointerup', 50, { isPrimary: false, pointerId: 2 })
		assert.ok(f.reorder.drag)
		pointer('pointerup', 250)
		assert.deepEqual(f.calls, [['reorder', 'name']])
	}
	finally { f.reorder.finish(false); f.restore() }
})

test('unexpected capture loss restores order and clears the drag without saving', () => {
	const f = fixture()
	try {
		f.reorder.init()
		f.pointer('pointerdown', 150)
		f.pointer('pointermove', 250)
		f.reorder.animate(0)
		const lostCapture = f.listeners.find(listener => listener.type === 'lostpointercapture').listener
		// Touch implicitly captures the header before the plugin captures the table.
		lostCapture({ pointerId: 1, target: f.rows[0].cells[2], type: 'lostpointercapture' })
		assert.ok(f.reorder.drag)
		lostCapture({
			pointerId: 1, target: f.element, type: 'lostpointercapture'
		})
		for (const row of f.rows) assert.deepEqual(row.cells.map(cell => cell.name), ['select', 'name', 'email'])
		assert.equal(f.reorder.drag, undefined)
		assert.equal(f.reorder.frame, undefined)
		assert.deepEqual(f.calls, [])
	}
	finally { f.reorder.finish(false); f.restore() }
})

test('one-pixel external movement cannot reverse placement around a wider column', () => {
	for (const adding of [false, true]) for (const direction of [-1, 1]) {
		const f = fixture({}, direction < 0 ? ['select', 'wide', 'new'] : ['select', 'new', 'wide'])
		try {
			for (const row of f.rows) for (const cell of row.cells) {
				const width = cell => cell.name === 'wide' ? 200 : 100
				cell.getBoundingClientRect = () => {
					const left = row.cells.slice(0, row.cells.indexOf(cell))
						.reduce((sum, previous) => sum + width(previous), 0)
					return { left, right: left + width(cell), top: 100, bottom: 140 }
				}
			}
			const header = f.rows[0].cells.find(cell => cell.name === 'new')
			const point = clientX => ({ clientX, clientY: 120, pointerId: 1, pointerType: 'mouse' })
			const start = direction < 0 ? 250 : 220
			const operation = f.reorder.beginExternal(header, point(start), { adding, removal: true })
			f.reorder.animate(0)
			const index = f.rows[0].cells.indexOf(header)
			assert.equal(index, direction < 0 ? 1 : 2)
			for (let step = 1; step <= 20; step ++) {
				operation.move(point(start + direction * step))
				f.reorder.animate(step * 16)
				assert.equal(f.rows[0].cells.indexOf(header), index, `direction ${direction}, step ${step}`)
			}
			// Reversing inside the same wide column is not a new crossing.
			operation.move(point(direction < 0 ? 310 : 190))
			f.reorder.animate(400)
			assert.equal(f.rows[0].cells.indexOf(header), index)
			operation.move(point(direction < 0 ? 190 : 310))
			f.reorder.animate(416)
			operation.move(point(direction < 0 ? 210 : 290))
			f.reorder.animate(432)
			assert.equal(f.rows[0].cells.indexOf(header), direction < 0 ? 2 : 1)
			operation.cancel()
		}
		finally { f.reorder.finish(false); f.restore() }
	}
})


test('turning around within a wide hovered column waits for exit and re-entry in every drag mode', () => {
	for (const mode of ['addition', 'external', 'internal']) for (const direction of [-1, 1]) {
		const f = fixture({}, direction < 0 ? ['select', 'wide', 'new'] : ['select', 'new', 'wide'])
		try {
			for (const row of f.rows) for (const cell of row.cells) {
				const width = cell => cell.name === 'wide' ? 200 : 100
				cell.getBoundingClientRect = () => {
					const left = row.cells.slice(0, row.cells.indexOf(cell))
						.reduce((sum, previous) => sum + width(previous), 0)
					return { left, right: left + width(cell), top: 100, bottom: 140 }
				}
			}
			const header = f.rows[0].cells.find(cell => cell.name === 'new')
			const point = clientX => ({ clientX, clientY: 120, pointerId: 1, pointerType: 'mouse' })
			const start = direction < 0 ? 250 : 220
			let operation
			if (mode === 'internal') {
				const rect = header.getBoundingClientRect()
				f.reorder.start({ header, id: 1, origin: (rect.left + rect.right) / 2, y: 120 }, start, 120)
				operation = { move: sample => f.reorder.updatePointer(sample.clientX, sample.clientY) }
			}
			else operation = f.reorder.beginExternal(header, point(start), {
				adding: mode === 'addition', removal: true
			})
			f.reorder.animate(0)
			const index = f.rows[0].cells.indexOf(header)
			assert.equal(index, direction < 0 ? 1 : 2)
			// Reverse twice without leaving the same large column.
			for (const x of [start + direction * 2, start, start - direction * 2, start]) {
				operation.move(point(x))
				f.reorder.animate(16)
				assert.equal(f.rows[0].cells.indexOf(header), index, `${mode}, direction ${direction}, pointer ${x}`)
			}
			operation.move(point(direction < 0 ? 190 : 310))
			f.reorder.animate(32)
			assert.equal(f.rows[0].cells.indexOf(header), index)
			operation.move(point(direction < 0 ? 210 : 290))
			f.reorder.animate(48)
			assert.equal(f.rows[0].cells.indexOf(header), direction < 0 ? 2 : 1)
		}
		finally { f.reorder.finish(false); f.restore() }
	}
})
