import { Plugin }        from '../../plugin/plugin.js'
import { PluginOptions } from '../../plugin/plugin.js'
import { Table }         from './table.js'

type Direction = -1 | 0 | 1

interface Drag extends Press
{
	cells:     HTMLTableCellElement[]
	col?:      HTMLTableColElement
	count:     number
	direction: Direction
	index:     number
	initial:   number
	maximum:   number
	minimum:   number
	scroll?:   HTMLElement
	time?:     number
}

interface Press
{
	header: HTMLTableCellElement
	id:     number
	origin: number
	x:      number
}

const clamp               = (value: number) => Math.max(0, Math.min(1, value))
const interactiveSelector = 'a, button, input, select, textarea, '
	+ '[contenteditable]:not([contenteditable="false"]), [draggable="true"]'
const maxScrollSpeed      = 800
const penetration         = 10
const rowSelector         = ':scope > tbody > tr, :scope > tfoot > tr, :scope > thead > tr'
const scrollZone          = 50

let activeDrag: TableColumnReorder | undefined

export class TableColumnReorder extends Plugin<Table, TableColumnReorderOptions>
{
	protected drag?:        Drag
	protected frame?:       number
	protected press?:       Press
	protected suppressClick = false

	protected animate(time: number)
	{
		this.frame = undefined
		const drag = this.drag
		if (!drag) return
		if (!this.isCurrent(drag)) {
			this.finish(false)
			return
		}

		const pointerDirection = drag.direction
		drag.direction         = 0
		const scrollDirection  = this.scroll(drag, time)
		const direction        = pointerDirection || scrollDirection
		const target           = direction ? this.target(drag, direction) : drag.index
		if (target !== drag.index) this.move(drag, target)
		if (scrollDirection) this.requestFrame()
	}

	protected colGroups()
	{
		return Array.from(this.of.element.children).filter(element => element.tagName === 'COLGROUP') as HTMLTableColElement[]
	}

	defaultOptions()
	{
		return new TableColumnReorderOptions()
	}

	protected finish(commit: boolean)
	{
		this.press = undefined
		if (this.frame !== undefined) cancelAnimationFrame(this.frame)
		this.frame = undefined
		const drag = this.drag
		if (!drag) return
		const changed = drag.index !== drag.initial
		const current = this.isCurrent(drag)
		if (!current) commit = false
		if (!commit && changed && current) this.move(drag, drag.initial)
		for (const cell of drag.cells) cell.classList.remove('column-reorder')
		if (activeDrag === this) {
			activeDrag = undefined
			document.documentElement.classList.remove('column-reorder')
		}
		this.drag = undefined
		if (this.of.element.hasPointerCapture(drag.id)) this.of.element.releasePointerCapture(drag.id)
		if (commit && changed) this.options.onReorder?.(drag.header)
	}

	init()
	{
		const table = this.of
		table.addEventListener(table.element, 'click', event => {
			if (!this.suppressClick) return
			this.suppressClick = false
			event.preventDefault()
			event.stopImmediatePropagation()
		}, { capture: true })
		table.addEventListener(document, 'keydown', event => {
			if ((event.key !== 'Escape') || !this.drag) return
			event.preventDefault()
			event.stopImmediatePropagation()
			this.finish(false)
		}, { capture: true })
		table.addEventListener(table.element, 'lostpointercapture', event => this.onPointer(event))
		table.addEventListener(document,      'pointercancel',      event => this.onPointer(event), { capture: true })
		table.addEventListener(table.element, 'pointerdown',        event => this.onPointer(event))
		table.addEventListener(document,      'pointermove',        event => this.onPointer(event), { capture: true })
		table.addEventListener(document,      'pointerup',          event => this.onPointer(event), { capture: true })
		table.onReset.push(() => {
			this.finish(false)
			this.suppressClick = false
		})
	}

	protected isCurrent(drag: Drag)
	{
		const rows = this.rows()
		if ((drag.header.parentElement !== this.triggerRow()) || (rows.length !== drag.cells.length)) return false
		if (rows.some((row, index) =>
			(row !== drag.cells[index].parentElement)
			|| (row.cells.length !== drag.count) || (row.cells[drag.index] !== drag.cells[index])
		)) return false
		const groups = this.colGroups()
		if (!drag.col) return !groups.length
		return (groups.length === 1) && (groups[0] === drag.col.parentElement)
			&& (groups[0].children.length === drag.count) && (groups[0].children[drag.index] === drag.col)
	}

	protected move(drag: Drag, targetIndex: number)
	{
		const after = drag.index < targetIndex
		for (const cell of drag.cells) {
			const target = (cell.parentElement as HTMLTableRowElement).cells[targetIndex]
			after ? target.after(cell) : target.before(cell)
		}
		if (drag.col) {
			const target = drag.col.parentElement!.children[targetIndex]
			after ? target.after(drag.col) : target.before(drag.col)
		}
		drag.index = targetIndex
	}

	protected onPointer(event: PointerEvent)
	{
		if (event.type === 'pointerdown') {
			if (activeDrag || this.drag || this.press || (event.button !== 0) || !event.isPrimary) return
			if (!(event.target instanceof Element)) return
			const header      = event.target.closest<HTMLTableCellElement>('th, td')
			const interactive = event.target.closest(interactiveSelector)
			if (
				!header
				|| (header.closest('table') !== this.of.element)
				|| (header.parentElement !== this.triggerRow())
				|| (interactive && header.contains(interactive))
			) return
			this.press = { header, id: event.pointerId, origin: event.clientX, x: event.clientX }
			return
		}

		const state = this.drag ?? this.press
		if (!state || (event.pointerId !== state.id)) return
		if (event.type === 'lostpointercapture') {
			if (this.drag) this.finish(false)
			return
		}
		if (event.type === 'pointercancel') {
			if (this.drag) {
				event.preventDefault()
				event.stopImmediatePropagation()
			}
			this.finish(false)
			return
		}
		if (event.type === 'pointerup') {
			if (!this.drag) {
				this.press = undefined
				return
			}
			event.preventDefault()
			event.stopImmediatePropagation()
			this.updatePointer(event.clientX)
			if ((this.frame !== undefined) || this.drag.direction) {
				if (this.frame !== undefined) cancelAnimationFrame(this.frame)
				this.frame = undefined
				this.animate(performance.now())
			}
			this.suppressClick = true
			setTimeout(() => this.suppressClick = false)
			this.finish(true)
			return
		}

		if (!this.drag) {
			if (Math.abs(event.clientX - state.origin) < Math.max(0, this.options.threshold)) {
				state.x = event.clientX
				return
			}
			this.press = undefined
			this.start(state, event.clientX)
		}
		if (!this.drag) return
		event.preventDefault()
		this.updatePointer(event.clientX)
	}

	protected requestFrame()
	{
		if (this.frame === undefined) this.frame = requestAnimationFrame(time => this.animate(time))
	}

	protected rows()
	{
		return Array.from(this.of.element.querySelectorAll<HTMLTableRowElement>(rowSelector))
	}

	protected scroll(drag: Drag, time: number): Direction
	{
		const container = drag.scroll
		if (!container) return 0
		const rect      = container.getBoundingClientRect()
		const left      = 1 - clamp((drag.x - rect.left) / scrollZone)
		const right     = 1 - clamp((rect.right - drag.x) / scrollZone)
		const direction = ((left > 0) || (right > 0)) ? ((right > left) ? 1 : -1) : 0
		if (!direction) {
			drag.time = undefined
			return 0
		}

		const previousTime = drag.time
		drag.time = time
		if (previousTime === undefined) return direction
		const previousScroll = container.scrollLeft
		container.scrollLeft += direction * maxScrollSpeed * Math.max(left, right) * (time - previousTime) / 1000
		if (container.scrollLeft !== previousScroll) return direction
		drag.time = undefined
		return 0
	}

	protected scrollContainer()
	{
		let element: HTMLElement | null = this.of.element
		while (element) {
			if (
				['auto', 'overlay', 'scroll'].includes(getComputedStyle(element).overflowX)
				&& (element.scrollWidth > element.clientWidth)
			) {
				return element
			}
			element = element.parentElement
		}
		return undefined
	}

	protected start(press: Press, x: number)
	{
		if (activeDrag) return
		const row     = this.triggerRow()
		const headers = Array.from(row?.cells ?? [])
		const initial = headers.indexOf(press.header)
		const rows    = this.rows()
		if (
			(initial < 0)
			|| !rows.length
			|| rows.some(row =>
				(row.cells.length !== headers.length)
				|| Array.from(row.cells).some(cell => (cell.colSpan !== 1) || (cell.rowSpan !== 1))
			)
		) return

		const groups = this.colGroups()
		if (groups.length > 1) return
		const columns = Array.from(groups[0]?.children ?? [])
		if (
			groups.length
			&& (
				(columns.length !== headers.length)
				|| columns.some(column => (column.tagName !== 'COL') || ((column as HTMLTableColElement).span !== 1))
			)
		) return

		const reorderable = headers.map(header => this.options.isReorderable?.(header) ?? true)
		if (!reorderable[initial]) return
		let maximum = initial
		let minimum = initial
		while ((maximum < headers.length - 1) && reorderable[maximum + 1]) maximum ++
		while ((minimum > 0) && reorderable[minimum - 1]) minimum --
		try {
			this.of.element.setPointerCapture(press.id)
		}
		catch {
			return
		}

		const drag: Drag = {
			...press,
			cells:     rows.map(row => row.cells[initial]),
			col:       columns[initial] as HTMLTableColElement | undefined,
			count:     headers.length,
			direction: Math.sign(x - press.x) as Direction,
			index:     initial,
			initial,
			maximum,
			minimum,
			scroll: this.scrollContainer(),
			x
		}
		this.drag  = drag
		activeDrag = this
		document.documentElement.classList.add('column-reorder')
		for (const cell of drag.cells) cell.classList.add('column-reorder')
		this.requestFrame()
	}

	protected target(drag: Drag, direction: Direction)
	{
		const headers = Array.from(this.triggerRow()?.cells ?? [])
		const source  = headers[drag.index]?.getBoundingClientRect()
		if (!source) return drag.index
		const sourceCenter = (source.left + source.right) / 2
		let distance       = 0
		let target         = drag.index
		for (let index = drag.minimum; index <= drag.maximum; index ++) {
			if (index === drag.index) continue
			const rect  = headers[index].getBoundingClientRect()
			const delta = (rect.left + rect.right) / 2 - sourceCenter
			const edge  = direction > 0 ? rect.left : rect.right
			if (
				(Math.sign(delta) === direction) && (direction * (drag.x - edge) >= penetration)
				&& (Math.abs(delta) > distance)
			) {
				distance = Math.abs(delta)
				target   = index
			}
		}
		return target
	}

	protected triggerRow()
	{
		return this.of.element.tHead?.rows[0] ?? this.of.element.tBodies[0]?.rows[0]
	}

	protected updatePointer(x: number)
	{
		const drag = this.drag
		if (!drag || (x === drag.x)) return
		drag.direction = Math.sign(x - drag.x) as Direction
		drag.x         = x
		this.requestFrame()
	}

}

export class TableColumnReorderOptions extends PluginOptions
{
	isReorderable?: (header: HTMLTableCellElement) => boolean
	onReorder?:     (header: HTMLTableCellElement) => void
	threshold     = 10
}
