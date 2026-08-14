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
	scroll?:   HTMLElement
	time?:     number
	x:         number
}

interface Press
{
	header: HTMLTableCellElement
	id:     number
	origin: number
}

const clamp          = (value: number) => Math.max(0, Math.min(1, value))
const maxScrollSpeed = 800
const penetration    = 10
const scrollZone     = 50

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
		const drag             = this.drag!
		const pointerDirection = drag.direction
		drag.direction         = 0
		const scrollDirection  = this.scroll(drag, time)
		const direction        = pointerDirection || scrollDirection
		const target           = direction ? this.target(drag, direction) : drag.index
		if (target !== drag.index) this.move(drag, target)
		if (scrollDirection) this.requestFrame()
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
		if (!commit && changed) this.move(drag, drag.initial)
		for (const cell of drag.cells) cell.classList.remove('column-reorder')
		document.documentElement.classList.remove('column-reorder')
		activeDrag = undefined
		this.drag  = undefined
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
			this.finish(false)
		}, { capture: true })
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
			if (activeDrag || this.press || (event.button !== 0)) return
			const header = (event.target as Element).closest<HTMLTableCellElement>('th, td')
			if (!header || (header.parentElement !== this.triggerRow())) return
			this.press = { header, id: event.pointerId, origin: event.clientX }
			return
		}

		const state = this.drag ?? this.press
		if (!state || (event.pointerId !== state.id)) return
		if (event.type === 'pointercancel') {
			this.finish(false)
			return
		}
		if (event.type === 'pointerup') {
			if (!this.drag) {
				this.press = undefined
				return
			}
			event.preventDefault()
			this.updatePointer(event.clientX)
			if (this.frame !== undefined) {
				cancelAnimationFrame(this.frame)
				this.frame = undefined
				this.animate(performance.now())
			}
			this.suppressClick = true
			setTimeout(() => this.suppressClick = false)
			this.finish(true)
			return
		}

		if (!this.drag) {
			if (Math.abs(event.clientX - state.origin) < this.options.threshold) return
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
		drag.time = time
		if (previousTime === undefined) return direction
		const previousScroll  = container.scrollLeft
		container.scrollLeft += speed * maxScrollSpeed * (time - previousTime) / 1000
		if (container.scrollLeft !== previousScroll) return direction
		drag.time = undefined
		return 0
	}

	protected scrollContainer()
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

	protected start(press: Press, x: number)
	{
		if (activeDrag) return
		const headers     = Array.from(this.triggerRow().cells)
		const initial     = headers.indexOf(press.header)
		const rows        = this.rows()
		const columns     = this.of.element.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
		const reorderable = headers.map(header => this.options.isReorderable?.(header) ?? true)
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

	protected updatePointer(x: number)
	{
		const drag = this.drag!
		if (x === drag.x) return
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
