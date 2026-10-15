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
	reorder.of = { element }
	const pointer = (type, x, y = 120) => reorder.onPointer({
		type, clientX: x, clientY: y, pointerId: 1, button: 0,
		target: rows[0].cells[1], preventDefault() {}
	})
	return {
		calls, element, makeRow, pointer, reorder, rows,
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
				type, clientX, clientY: 120, pointerId: 1, button: 0, target: header, preventDefault() {}
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
