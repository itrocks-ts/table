import assert             from 'node:assert/strict'
import { test }           from 'node:test'
import { TableColumnAdd } from '../column-add.js'
import { TableFreeze }    from '../freeze.js'

function rect(left, right, top = 0, bottom = 400)
{
	return { x: left, y: top, width: right - left, height: bottom - top,
		get left() { return this.x }, get right() { return this.x + this.width },
		get top() { return this.y }, get bottom() { return this.y + this.height } }
}

const cell = (left, right, top, bottom) => ({ getBoundingClientRect: () => rect(left, right, top, bottom) })

for (const shape of ['colgroup', 'header', 'body']) {
	for (const [left, right] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2]]) {
		test(`${shape}: visible bounds use sticky cells with ${left} left and ${right} right columns`, () => {
			const cells = [cell(10, 60), cell(60, 110), cell(-200, 0), cell(410, 460), cell(460, 510)]
			const row = { cells }
			const freeze = new TableFreeze()
			freeze.columns = shape === 'colgroup' ? cells.map(() => cell(-500, -400)) : cells
			freeze.leftColumnCount = left
			freeze.rightColumnCount = right
			freeze.of = { element: { getBoundingClientRect: () => rect(-400, 900),
				tHead: shape === 'body' ? null : { rows: [row] }, tBodies: [{ rows: [row] }] } }
			const actual = freeze.visibleInnerRect()
			assert.deepEqual([actual.left, actual.right, actual.top, actual.bottom],
				[left ? cells[left - 1].getBoundingClientRect().right : -400,
					right ? cells[cells.length - right].getBoundingClientRect().left : 900, 0, 400])
		})
	}
}

test('visible bounds retain the original opposite edges when headers and footers restrict the rectangle', () => {
	const freeze = new TableFreeze()
	freeze.leftColumnCount = freeze.rightColumnCount = 0
	freeze.of = { element: { getBoundingClientRect: () => rect(0, 900, 0, 700),
		tHead: { rows: [], lastElementChild: { firstElementChild: cell(0, 900, 0, 50) } },
		tFoot: { firstElementChild: { firstElementChild: cell(0, 900, 650, 700) } }, tBodies: [] } }
	const actual = freeze.visibleInnerRect()
	assert.deepEqual([actual.left, actual.right, actual.top, actual.bottom], [0, 900, 50, 650])
})

for (const [name, left, right, expected] of [
	['fitting hidden left', -50, 150, -150], ['fitting hidden right', 450, 650, 150],
	['fitting already visible', 200, 400, 0], ['wide hidden left', -250, 450, -50],
	['wide hidden right', 150, 850, 50], ['wide covers inner area', -50, 650, 0]
]) {
	test(`reveal: ${name} minimises movement and maximises visible area`, () => {
		const freeze = new TableFreeze()
		freeze.visibleInnerRect = () => rect(100, 500)
		const scroll = { getBoundingClientRect: () => rect(0, 600), scrollLeft: 1000 }
		const addition = new TableColumnAdd()
		addition.find = () => cell(left, right)
		addition.of = { plugins: { TableFreeze: freeze } }
		addition.reorder = { scrollContainer: () => scroll }
		addition.reveal('opaque/id')
		assert.equal(scroll.scrollLeft, 1000 + expected)
	})
}

test('refresh removes applied sticky rules before measuring header-backed column offsets', () => {
	const freeze = new TableFreeze()
	const sequence = []
	freeze.rules = ['sticky']
	freeze.of = { styleSheet: ['other', 'sticky'], refreshStyleSheets() {
		assert.deepEqual(this.styleSheet, ['other'])
		sequence.push('natural layout')
	} }
	freeze.init = () => sequence.push('measure')
	freeze.refresh()
	assert.deepEqual(sequence, ['natural layout', 'measure'])
})
