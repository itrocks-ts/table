import { Plugin } from '../../plugin/plugin.js'
import { Table }  from './table.js'

export type HTMLTableFreezeElement = HTMLTableCellElement | HTMLTableColElement

interface FullIndex
{
	column: string
	corner: string
	row:    string
}

export class TableFreeze extends Plugin<Table>
{
	columns:          NodeListOf<HTMLTableFreezeElement>
	full?:            FullIndex
	leftColumnCount:  number
	rightColumnCount: number
	zIndex            = '1'

	constructor(table: Table)
	{
		super(table)
		this.columns          = this.getColumns()
		this.leftColumnCount  = this.countLeftColumns()
		this.rightColumnCount = this.countRightColumns()
	}

	init()
	{
		this.freezeFootRows()
		this.freezeHeadRows()
		this.freezeLeftColumns()
		this.freezeRightColumns()
	}

	closestScrollable(element: Element)
	{
		let parent = element.closest('table')?.parentElement
		while (parent && (parent.scrollHeight <= parent.clientHeight)) {
			parent = parent.parentElement
		}
		return parent ? ((parent instanceof HTMLHtmlElement) ? window : parent) : undefined
	}

	protected countLeftColumns()
	{
		let count = 0
		while ((count < this.columns.length - 1) && (this.columns[count].dataset.freeze !== undefined)) {
			count ++
		}
		return count
	}

	protected countRightColumns()
	{
		let count = this.columns.length - 1
		while ((count > 0) && (this.columns[count].dataset.freeze !== undefined)) {
			count --
		}
		return this.columns.length - 1 - count
	}

	protected freezeFootRows()
	{
		const table = this.of
		if (!table.element.tFoot?.rows.length) return
		let counter = 1, bottom = .0, previousBottom = table.element.getBoundingClientRect().bottom
		for (const row of Array.from(table.element.tFoot.querySelectorAll<HTMLTableRowElement>(':scope > tr')).reverse()) {
			const actualBottom = row.getBoundingClientRect().bottom
			bottom += previousBottom - actualBottom
			previousBottom = actualBottom
			table.styleSheet.push(`
				${table.selector} > tfoot > tr:nth-last-child(${counter}) > * {
					bottom: ${this.position(Math.floor(bottom), counter, row.firstElementChild as HTMLTableCellElement, 'bottom')};
				}
			`)
			counter ++
		}
		const zIndex = this.full ? `z-index: ${this.full.row};` : ''
		table.styleSheet.push(`
			${table.selector} > tfoot > tr > * {
				position: sticky;
				${zIndex}
			}		
		`)
	}

	protected freezeHeadRows()
	{
		const table = this.of
		if (!table.element.tHead?.rows.length) return
		let counter = 1, top = .0, previousTop = table.element.getBoundingClientRect().top
		table.element.tHead.querySelectorAll<HTMLTableRowElement>(':scope > tr').forEach(row => {
			const actualTop = row.getBoundingClientRect().top
			top += actualTop - previousTop
			previousTop = actualTop
			table.styleSheet.push(`
				${table.selector} > thead > tr:nth-child(${counter}) > * {
					top: ${this.position(Math.ceil(top), counter, row.firstElementChild as HTMLTableCellElement, 'top')};
				}
			`)
			counter ++
		})
		const zIndex = this.full ? `z-index: ${this.full.row};` : ''
		table.styleSheet.push(`
			${table.selector} > thead > tr > * {
				position: sticky;
				${zIndex}
			}		
		`)
	}

	protected freezeLeftColumns()
	{
		if (!this.leftColumnCount) return
		const table = this.of
		const bodySel:   string[] = []
		const cornerSel: string[] = []
		let counter = 1, left = .0, previousLeft = table.element.getBoundingClientRect().left
		for (const colCell of Array.from(this.columns).toSpliced(this.leftColumnCount)) {
			const actualLeft = colCell.getBoundingClientRect().left
			left += actualLeft - previousLeft
			previousLeft = actualLeft
			table.styleSheet.push(`
				${table.selector} > * > tr > :nth-child(${counter}) {
					left: ${this.position(Math.ceil(left), counter, colCell, 'left')};
				}
			`)
			bodySel.push(`${table.selector} > tbody > tr > :nth-child(${counter})`)
			cornerSel.push(`${table.selector} > tfoot > tr > :nth-child(${counter})`)
			cornerSel.push(`${table.selector} > thead > tr > :nth-child(${counter})`)
			counter ++
		}
		const zIndex      = this.full ? `z-index: ${this.full.column};` : ''
		const zIndexValue = this.full ? this.full.corner : this.zIndex
		table.styleSheet.push(`
			${bodySel.join(', ')} {
				position: sticky;
				${zIndex}
			}
			${cornerSel.join(', ')} {
				z-index: ${zIndexValue};
			}
		`)
	}

	protected freezeRightColumns()
	{
		if (!this.rightColumnCount) return
		const table = this.of
		const bodySel:   string[] = []
		const cornerSel: string[] = []
		let counter = 1, right = .0, previousRight = table.element.getBoundingClientRect().right
		for (const colCell of Array.from(this.columns).reverse().toSpliced(this.rightColumnCount)) {
			const actualRight = colCell.getBoundingClientRect().right
			right += previousRight - actualRight
			previousRight = actualRight
			table.styleSheet.push(`
				${table.selector} > * > tr > :nth-last-child(${counter}) {
					right: ${this.position(Math.floor(right), counter, colCell, 'right')};
				}
			`)
			bodySel.push(`${table.selector} > tbody > tr > :nth-last-child(${counter})`)
			if (this.full) {
				cornerSel.push(`${table.selector} > tfoot > tr > :nth-last-child(${counter})`)
			}
			cornerSel.push(`${table.selector} > thead > tr > :nth-last-child(${counter})`)
			counter ++
		}
		const zIndex      = this.full ? `z-index: ${this.full.column};` : ''
		const zIndexValue = this.full ? this.full.corner : this.zIndex
		table.styleSheet.push(`
			${bodySel.join(', ')} {
				position: sticky;
				${zIndex}
			}
			${cornerSel.join(', ')} {
				z-index: ${zIndexValue};
			}
		`)
	}

	protected getColumns()
	{
		if (this.columns) return this.columns
		const table = this.of
		let columns = table.element.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
		if (!columns.length) {
			columns = table.element.querySelectorAll<HTMLTableColElement>(':scope > thead > tr:first-child > *')
			if (!columns.length) {
				columns = table.element.querySelectorAll<HTMLTableColElement>(':scope > tbody > tr:first-child > *')
			}
		}
		return columns
	}

	position(
		position: number,
		_counter: number,
		_colCell: HTMLTableFreezeElement,
		_side:    'bottom'|'left'|'right'|'top'
	) {
		return `${position}px`
	}

	visibleInnerRect()
	{
		const tableElement = this.of.element
		const rect         = tableElement.getBoundingClientRect()
		if (this.leftColumnCount) {
			rect.x = this.columns[this.leftColumnCount - 1].getBoundingClientRect().right
		}
		if (tableElement.tHead?.lastElementChild?.firstElementChild) {
			rect.y = tableElement.tHead.lastElementChild.firstElementChild.getBoundingClientRect().bottom
		}
		if (this.rightColumnCount) {
			rect.width = this.columns[this.columns.length - this.rightColumnCount].getBoundingClientRect().left - rect.x + 1
		}
		if (tableElement.tFoot?.firstElementChild?.firstElementChild) {
			rect.height = tableElement.tFoot.firstElementChild.firstElementChild.getBoundingClientRect().top - rect.y + 1
		}
		return rect
	}

}
