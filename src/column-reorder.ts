import { Plugin }        from '../../plugin/plugin.js'
import { PluginOptions } from '../../plugin/plugin.js'
import { Table }         from './table.js'

type Direction = -1 | 0 | 1

interface Drag extends Press
{
	cells:     HTMLTableCellElement[]
	col?:      HTMLTableColElement
	direction: Direction
	index:     number
	initial:   number
	maximum:   number
	minimum:   number
	remove:    boolean
	scroll?:   HTMLElement
	time?:     number
	x:         number
	y:         number
}

interface Press
{
	header: HTMLTableCellElement
	id:     number
	origin: number
	y:      number
}

let activeDrag: TableColumnReorder | undefined

const clamp          = (value: number) => Math.max(0, Math.min(1, value))
const maxScrollSpeed = 800
const penetration    = 10
const scrollZone     = 50

export class TableColumnReorder extends Plugin<Table, TableColumnReorderOptions>
{
	protected drag?:  Drag
	protected frame?: number
	protected press?: Press
	protected suppressClick = false

	protected animate(time: number)
	{
		this.frame = undefined
		const drag = this.drag!
		this.updateState(drag)
		const pointerDirection = drag.direction
		drag.direction         = 0
		const scrollDirection  = this.scroll(drag, time)
		if (scrollDirection) this.requestFrame()
		const direction = pointerDirection || scrollDirection
		const target    = direction ? this.target(drag, direction) : drag.index
		if (target !== drag.index) this.move(drag, target)
	}

	defaultOptions()
	{
		return new TableColumnReorderOptions()
	}

	/** Move a column inside its existing reorderable boundaries, without committing a header gesture. */
	moveColumn(header: HTMLTableCellElement, targetIndex: number)
	{
		if (!Number.isFinite(targetIndex)) throw new Error('Column index must be finite')
		if (this.drag || this.press) throw new Error('A header interaction is active')
		const headers = Array.from(this.triggerRow().cells)
		const index   = headers.indexOf(header)
		if ((index < 0) || !(this.options.isReorderable?.(header) ?? true)) return
		let maximum = index
		let minimum = index
		while ((maximum < headers.length - 1) && (this.options.isReorderable?.(headers[maximum + 1]) ?? true)) maximum ++
		while ((minimum > 0) && (this.options.isReorderable?.(headers[minimum - 1]) ?? true)) minimum --
		this.moveCells(index, Math.max(minimum, Math.min(maximum, Math.trunc(targetIndex))))
	}

	/** Retain the active gesture when asynchronous rendering replaces one of its cells. */
	replaceCell(previous: HTMLTableCellElement, replacement: HTMLTableCellElement)
	{
		if (this.press?.header === previous) this.press.header = replacement
		if (this.drag) {
			if (this.drag.header === previous) this.drag.header = replacement
			this.drag.cells = this.drag.cells.map(cell => cell === previous ? replacement : cell)
			for (const name of ['column-reorder', 'moving', 'removing']) {
				if (previous.classList.contains(name)) replacement.classList.add(name)
			}
		}
		previous.replaceWith(replacement)
	}

	protected finish(commit: boolean)
	{
		this.press = undefined
		if (this.frame !== undefined) {
			cancelAnimationFrame(this.frame)
		}
		this.frame = undefined
		const drag = this.drag
		if (!drag) return
		const changed = drag.index !== drag.initial
		if (!commit && changed) this.move(drag, drag.initial)
		const removed = commit && drag.remove
		if (removed) {
			for (const row of this.rows()) {
				row.cells[drag.index]?.remove()
			}
			drag.col?.remove()
		}
		for (const cell of drag.cells) {
			cell.classList.remove('column-reorder', 'moving', 'removing')
		}
		document.documentElement.classList.remove('column-reorder')
		activeDrag = undefined
		this.drag  = undefined
		if (this.of.element.hasPointerCapture(drag.id)) this.of.element.releasePointerCapture(drag.id)
		if (removed) {
			this.options.onRemove?.(drag.header)
		}
		else if (commit && changed) {
			this.options.onReorder?.(drag.header)
		}
	}

	init()
	{
		const table   = this.of

		const section = table.element.tHead?.rows.length ? 'thead' : 'tbody:first-of-type'
		// Reserve both axes before pointerdown, including vertical drags used to remove a column.
		table.styleSheet.push(`
			${table.selector} > ${section} > tr:first-child > :is(th, td) {
				touch-action: none;
				-webkit-user-select: none;
				user-select: none;
			}
		`)

		table.addEventListener(table.element, 'click', event => {
			if (!this.suppressClick || (event.detail === 0)) return
			this.suppressClick = false
			event.preventDefault()
			event.stopImmediatePropagation()
		}, { capture: true })
		table.addEventListener(document, 'keydown', event => {
			if ((event.key !== 'Escape') || !this.drag) return
			event.preventDefault()
			this.finish(false)
		}, { capture: true })
		table.addEventListener(table.element, 'lostpointercapture', event => {
			if (event.target === table.element) this.onPointer(event)
		})
		table.addEventListener(document,      'pointercancel', event => this.onPointer(event), { capture: true })
		table.addEventListener(table.element, 'pointerdown',   event => this.onPointer(event))
		table.addEventListener(document,      'pointermove',   event => this.onPointer(event), { capture: true })
		table.addEventListener(document,      'pointerup',     event => this.onPointer(event), { capture: true })

		table.onReset.push(() => {
			this.finish(false)
			this.suppressClick = false
		})
	}

	protected move(drag: Drag, targetIndex: number)
	{
		this.moveCells(drag.index, targetIndex)
		drag.index = targetIndex
		this.updateState(drag)
	}

	protected moveCells(index: number, targetIndex: number)
	{
		if (index === targetIndex) return
		const after = index < targetIndex
		for (const row of this.rows()) {
			const cell   = row.cells[index]
			const target = row.cells[targetIndex]
			after ? target.after(cell) : target.before(cell)
		}
		const columns = this.of.element.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
		if (columns[index]) {
			const target = columns[targetIndex]
			after ? target.after(columns[index]) : target.before(columns[index])
		}
	}

	protected onPointer(event: PointerEvent)
	{
		if (event.type === 'pointerdown') {
			if (activeDrag || this.press || !event.isPrimary || (event.button !== 0)) return
			this.suppressClick = false
			const header = (event.target as Element).closest<HTMLTableCellElement>('th, td')
			if (!header || (header.parentElement !== this.triggerRow())) return
			this.press = { header, id: event.pointerId, origin: event.clientX, y: event.clientY }
			return
		}

		const state = this.drag ?? this.press
		if (!state || (event.pointerId !== state.id)) return
		if ((event.type === 'pointercancel') || (event.type === 'lostpointercapture')) {
			this.finish(false)
			return
		}
		if (event.type === 'pointerup') {
			if (!this.drag) {
				this.press = undefined
				return
			}
			event.preventDefault()
			this.updatePointer(event.clientX, event.clientY)
			if (this.frame !== undefined) {
				cancelAnimationFrame(this.frame)
				this.frame = undefined
				this.animate(performance.now())
			}
			this.finish(true)
			return
		}

		if (!this.drag) {
			if (Math.hypot(event.clientX - state.origin, event.clientY - state.y) < this.options.threshold) return
			this.press = undefined
			this.start(state, event.clientX, event.clientY)
		}
		if (!this.drag) return
		event.preventDefault()
		this.updatePointer(event.clientX, event.clientY)
	}

	protected requestFrame()
	{
		if (this.frame === undefined) this.frame = requestAnimationFrame(time => this.animate(time))
	}

	protected rows()
	{
		return Array.from(this.of.element.rows)
	}

	protected scroll(drag: Drag, time: number): Direction
	{
		const container = drag.scroll
		if (!container) return 0
		const rect      = container.getBoundingClientRect()
		const left      = clamp((rect.left + scrollZone - drag.x) / scrollZone)
		const right     = clamp((drag.x - rect.right + scrollZone) / scrollZone)
		const speed     = right - left
		const direction = Math.sign(speed) as Direction
		if (!direction) {
			drag.time = undefined
			return 0
		}

		const previousTime = drag.time
		drag.time          = time
		if (previousTime === undefined) return direction
		const previousScroll  = container.scrollLeft
		container.scrollLeft += speed * maxScrollSpeed * (time - previousTime) / 1000
		if (container.scrollLeft !== previousScroll) return direction
		drag.time = undefined
		return 0
	}

	scrollContainer()
	{
		for (let element: HTMLElement | null = this.of.element; element; element = element.parentElement) {
			if (
				['auto', 'overlay', 'scroll'].includes(getComputedStyle(element).overflowX)
				&& (element.scrollWidth > element.clientWidth)
			) {
				return element
			}
		}
		return undefined
	}

	protected start(press: Press, x: number, y: number)
	{
		if (activeDrag) return
		const headers     = Array.from(this.triggerRow().cells)
		const initial     = headers.indexOf(press.header)
		const rows        = this.rows()
		const columns     = this.of.element.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
		const reorderable = headers.map(header => !header.classList.contains('column-add-provisional')
			&& (this.options.isReorderable?.(header) ?? true))
		if (!reorderable[initial]) return
		let maximum = initial
		let minimum = initial
		while ((maximum < headers.length - 1) && reorderable[maximum + 1]) maximum ++
		while ((minimum > 0) && reorderable[minimum - 1]) minimum --
		this.of.element.setPointerCapture(press.id)

		const drag: Drag = {
			...press,
			cells:     rows.map(row => row.cells[initial]),
			col:       columns[initial],
			direction: Math.sign(x - press.origin) as Direction,
			index:     initial,
			initial,
			maximum,
			minimum,
			remove: false,
			scroll: this.scrollContainer(),
			x,
			y
		}
		this.drag  = drag
		activeDrag = this
		// Keep suppression until the compatibility click arrives, even if touch delays it.
		this.suppressClick = true
		document.documentElement.classList.add('column-reorder')
		for (const cell of drag.cells) cell.classList.add('column-reorder')
		this.updateState(drag)
		this.requestFrame()
	}

	protected target(drag: Drag, direction: Direction)
	{
		const headers = this.triggerRow().cells
		let target    = drag.index
		for (
			let index = drag.index + direction;
			(index >= drag.minimum) && (index <= drag.maximum);
			index += direction
		) {
			const rect = headers[index].getBoundingClientRect()
			const edge = direction > 0 ? rect.left : rect.right
			if (direction * (drag.x - edge) < penetration) break
			target = index
		}
		return target
	}

	protected triggerRow()
	{
		return this.of.element.tHead?.rows[0] ?? this.of.element.tBodies[0]?.rows[0]
	}

	protected updateState(drag: Drag)
	{
		if (this.options.onRemove) {
			const rect    = this.of.element.getBoundingClientRect()
			const headers = this.triggerRow().cells
			const first   = headers[drag.minimum].getBoundingClientRect()
			const last    = headers[drag.maximum].getBoundingClientRect()
			const left    = Math.max(rect.left, first.left, headers[drag.minimum - 1]?.getBoundingClientRect().right ?? rect.left)
			const right   = Math.min(rect.right, last.right, headers[drag.maximum + 1]?.getBoundingClientRect().left ?? rect.right)
			drag.remove = (drag.x < left) || (drag.x > right) || (drag.y < rect.top) || (drag.y > rect.bottom)
		}
		for (const cell of drag.cells) {
			cell.classList.toggle('removing', drag.remove)
			cell.classList.toggle('moving', !drag.remove && (drag.index !== drag.initial))
		}
	}

	protected updatePointer(x: number, y: number)
	{
		const drag = this.drag!
		if ((x === drag.x) && (y === drag.y)) return
		drag.direction = Math.sign(x - drag.x) as Direction
		drag.x         = x
		drag.y         = y
		this.updateState(drag)
		this.requestFrame()
	}

}

export class TableColumnReorderOptions extends PluginOptions
{
	isReorderable?: (header: HTMLTableCellElement) => boolean
	onRemove?:      (header: HTMLTableCellElement) => void
	onReorder?:     (header: HTMLTableCellElement) => void
	threshold = 10
}
