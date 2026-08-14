import { Plugin }        from '../../plugin/plugin.js'
import { PluginOptions } from '../../plugin/plugin.js'
import { Table }         from './table.js'

type Direction = -1 | 0 | 1

interface ArmedState
{
	header:    HTMLTableCellElement
	lastX:     number
	pointerId: number
	startX:    number
	status:    'armed'
}

interface Grid
{
	colGroup?:   HTMLTableColElement
	columnCount: number
	rows:        HTMLTableRowElement[]
	sourceCells: HTMLTableCellElement[]
	sourceCol?:  HTMLTableColElement
}

interface DraggingState extends Grid
{
	currentIndex:    number
	direction:       Direction
	header:          HTMLTableCellElement
	initialIndex:    number
	lastFrameTime?:  number
	maximumIndex:    number
	minimumIndex:    number
	pointerId:       number
	pointerX:        number
	status:          'dragging'
	scrollContainer?: HTMLElement
}

type ReorderState = ArmedState | DraggingState

const interactiveSelector = [
	'a',
	'button',
	'input',
	'select',
	'textarea',
	'[contenteditable]:not([contenteditable="false"])',
	'[draggable="true"]'
].join(', ')
const maxScrollSpeed = 800
const penetration    = 10
const scrollZone     = 50

let cursorOwner: TableColumnReorder | undefined

export class TableColumnReorderOptions extends PluginOptions
{
	isReorderable?: (header: HTMLTableCellElement) => boolean
	onReorder?:      (header: HTMLTableCellElement) => void
	threshold        = 10
}

export class TableColumnReorder extends Plugin<Table, TableColumnReorderOptions>
{
	protected animationFrame?: number
	protected clickTimer?:     number
	protected state?:          ReorderState
	protected suppressClick    = false

	defaultOptions()
	{
		return new TableColumnReorderOptions()
	}

	init()
	{
		const table = this.of
		table.styleSheet.push(`
			html.column-reorder,
			html.column-reorder * {
				cursor: ew-resize !important;
			}
		`)
		table.addEventListener(table.element, 'click',              event => this.onClick(event), { capture: true })
		table.addEventListener(document,     'keydown',            event => this.onKeyDown(event), { capture: true })
		table.addEventListener(table.element, 'lostpointercapture', event => this.onLostPointerCapture(event))
		table.addEventListener(document,     'pointercancel',      event => this.onPointerCancel(event), { capture: true })
		table.addEventListener(table.element, 'pointerdown',        event => this.onPointerDown(event))
		table.addEventListener(document,     'pointermove',        event => this.onPointerMove(event), { capture: true })
		table.addEventListener(document,     'pointerup',          event => this.onPointerUp(event), { capture: true })
		table.onReset.push(() => this.destroy())
	}

	protected autoScroll(state: DraggingState, time: number): Direction
	{
		const container = state.scrollContainer
		if (!container) return 0

		const rect           = container.getBoundingClientRect()
		const leftProximity  = 1 - this.clamp((state.pointerX - rect.left) / scrollZone)
		const rightProximity = 1 - this.clamp((rect.right - state.pointerX) / scrollZone)
		let direction: Direction = 0
		let proximity = 0
		if ((leftProximity > 0) || (rightProximity > 0)) {
			direction = (rightProximity > leftProximity) ? 1 : -1
			proximity = Math.max(leftProximity, rightProximity)
		}
		if (!direction) {
			state.lastFrameTime = undefined
			return 0
		}

		const previousTime = state.lastFrameTime
		state.lastFrameTime = time
		if (previousTime === undefined) return direction

		const previousScroll = container.scrollLeft
		const elapsed        = Math.max(0, time - previousTime) / 1000
		container.scrollLeft += direction * maxScrollSpeed * proximity * elapsed
		if (container.scrollLeft === previousScroll) {
			state.lastFrameTime = undefined
			return 0
		}
		return direction
	}

	protected clamp(value: number)
	{
		return Math.max(0, Math.min(1, value))
	}

	protected closestHorizontalScrollable()
	{
		let element: HTMLElement | null = this.of.element
		while (element) {
			const overflow = getComputedStyle(element).overflowX
			if (['auto', 'overlay', 'scroll'].includes(overflow) && (element.scrollWidth > element.clientWidth)) {
				return element
			}
			element = element.parentElement
		}
		return undefined
	}

	protected collectGrid(header: HTMLTableCellElement): Grid | undefined
	{
		const headerRow   = this.triggerRow()
		const columnCount = headerRow?.cells.length ?? 0
		if (!headerRow || !columnCount || (header.parentElement !== headerRow)) return undefined

		const initialIndex = Array.from(headerRow.cells).indexOf(header)
		const rows         = this.tableRows()
		if ((initialIndex < 0) || !rows.length) return undefined
		for (const row of rows) {
			if ((row.cells.length !== columnCount) || Array.from(row.cells).some(cell => {
				return (cell.colSpan !== 1) || (cell.rowSpan !== 1)
			})) {
				return undefined
			}
		}

		const colGroups = Array.from(this.of.element.children).filter(element => element.tagName === 'COLGROUP')
		if (colGroups.length > 1) return undefined
		const colGroup = colGroups[0] as HTMLTableColElement | undefined
		let sourceCol: HTMLTableColElement | undefined
		if (colGroup) {
			const columns = Array.from(colGroup.children)
			if (
				(columns.length !== columnCount)
				|| columns.some(column => (column.tagName !== 'COL') || ((column as HTMLTableColElement).span !== 1))
			) {
				return undefined
			}
			sourceCol = columns[initialIndex] as HTMLTableColElement
		}

		return {
			colGroup,
			columnCount,
			rows,
			sourceCells: rows.map(row => row.cells[initialIndex]),
			sourceCol
		}
	}

	protected destroy()
	{
		this.finish(false)
		if (this.clickTimer !== undefined) {
			clearTimeout(this.clickTimer)
			this.clickTimer = undefined
		}
		this.suppressClick = false
	}

	protected finish(commit: boolean)
	{
		const state = this.state
		if (!state) return
		if (this.animationFrame !== undefined) {
			cancelAnimationFrame(this.animationFrame)
			this.animationFrame = undefined
		}

		let changed = false
		if (state.status === 'dragging') {
			if (!this.structureIsCurrent(state)) commit = false
			changed = state.currentIndex !== state.initialIndex
			if (!commit && changed) this.moveColumn(state, state.initialIndex)
			for (const cell of state.sourceCells) cell.classList.remove('column-reorder')
			if (cursorOwner === this) {
				cursorOwner = undefined
				document.documentElement.classList.remove('column-reorder')
			}
		}

		this.state = undefined
		if ((state.status === 'dragging') && this.of.element.hasPointerCapture(state.pointerId)) {
			this.of.element.releasePointerCapture(state.pointerId)
		}
		if (commit && changed && (state.status === 'dragging')) this.options.onReorder?.(state.header)
	}

	protected headerAtPointer(state: DraggingState, direction: Direction)
	{
		const headers      = Array.from(this.triggerRow()?.cells ?? [])
		const sourceRect   = headers[state.currentIndex]?.getBoundingClientRect()
		if (!sourceRect) return state.currentIndex
		const sourceCenter = (sourceRect.left + sourceRect.right) / 2
		let distance       = 0
		let target         = state.currentIndex

		for (let index = state.minimumIndex; index <= state.maximumIndex; index ++) {
			if (index === state.currentIndex) continue
			const rect   = headers[index].getBoundingClientRect()
			const center = (rect.left + rect.right) / 2
			if ((direction > 0) && (center > sourceCenter) && (state.pointerX >= rect.left + penetration)) {
				const candidateDistance = center - sourceCenter
				if (candidateDistance > distance) {
					distance = candidateDistance
					target   = index
				}
			}
			if ((direction < 0) && (center < sourceCenter) && (state.pointerX <= rect.right - penetration)) {
				const candidateDistance = sourceCenter - center
				if (candidateDistance > distance) {
					distance = candidateDistance
					target   = index
				}
			}
		}
		return target
	}

	protected moveColumn(state: DraggingState, targetIndex: number)
	{
		if ((targetIndex === state.currentIndex) || !this.structureIsCurrent(state)) {
			return targetIndex === state.currentIndex
		}
		const moveAfter = state.currentIndex < targetIndex
		for (let index = 0; index < state.rows.length; index ++) {
			const source = state.sourceCells[index]
			const target = state.rows[index].cells[targetIndex]
			moveAfter ? target.after(source) : target.before(source)
		}
		if (state.sourceCol && state.colGroup) {
			const target = state.colGroup.children[targetIndex]
			moveAfter ? target.after(state.sourceCol) : target.before(state.sourceCol)
		}
		state.currentIndex = targetIndex
		return true
	}

	protected onAnimationFrame(time: number)
	{
		this.animationFrame = undefined
		const state = this.state
		if (!state || (state.status !== 'dragging')) return
		if (!this.structureIsCurrent(state)) {
			this.finish(false)
			return
		}

		const pointerDirection = state.direction
		state.direction = 0
		const scrollDirection = this.autoScroll(state, time)
		const direction       = pointerDirection || scrollDirection
		if (direction) {
			const targetIndex = this.headerAtPointer(state, direction)
			if (targetIndex !== state.currentIndex) this.moveColumn(state, targetIndex)
		}
		if (scrollDirection) this.requestFrame()
	}

	protected onClick(event: MouseEvent)
	{
		if (!this.suppressClick) return
		this.suppressClick = false
		event.preventDefault()
		event.stopImmediatePropagation()
	}

	protected onKeyDown(event: KeyboardEvent)
	{
		if ((event.key !== 'Escape') || (this.state?.status !== 'dragging')) return
		event.preventDefault()
		event.stopImmediatePropagation()
		this.finish(false)
	}

	protected onLostPointerCapture(event: PointerEvent)
	{
		if ((this.state?.status !== 'dragging') || (event.pointerId !== this.state.pointerId)) return
		this.finish(false)
	}

	protected onPointerCancel(event: PointerEvent)
	{
		if (!this.state || (event.pointerId !== this.state.pointerId)) return
		if (this.state.status === 'dragging') {
			event.preventDefault()
			event.stopImmediatePropagation()
		}
		this.finish(false)
	}

	protected onPointerDown(event: PointerEvent)
	{
		if (this.state || cursorOwner || !event.isPrimary || (event.button !== 0)) return
		if (!(event.target instanceof Element)) return
		const header = event.target.closest<HTMLTableCellElement>('th, td')
		const row    = this.triggerRow()
		if (!header || !row || (header.parentElement !== row) || (header.closest('table') !== this.of.element)) return
		const interactive = event.target.closest(interactiveSelector)
		if (interactive && header.contains(interactive)) return

		this.state = {
			header,
			lastX: event.clientX,
			pointerId: event.pointerId,
			startX: event.clientX,
			status: 'armed'
		}
	}

	protected onPointerMove(event: PointerEvent)
	{
		const state = this.state
		if (!state || (event.pointerId !== state.pointerId)) return
		if (state.status === 'armed') {
			if (Math.abs(event.clientX - state.startX) < Math.max(0, this.options.threshold)) {
				state.lastX = event.clientX
				return
			}
			if (!this.startDragging(state, event.clientX)) return
		}
		const dragging = this.state
		if (!dragging || (dragging.status !== 'dragging')) return
		event.preventDefault()
		if (event.clientX !== dragging.pointerX) {
			dragging.direction = (event.clientX > dragging.pointerX) ? 1 : -1
			dragging.pointerX  = event.clientX
			this.requestFrame()
		}
	}

	protected onPointerUp(event: PointerEvent)
	{
		if (!this.state || (event.pointerId !== this.state.pointerId)) return
		if (this.state.status === 'armed') {
			this.finish(false)
			return
		}
		event.preventDefault()
		event.stopImmediatePropagation()
		const dragging = this.state
		if (event.clientX !== dragging.pointerX) {
			dragging.direction = (event.clientX > dragging.pointerX) ? 1 : -1
			dragging.pointerX  = event.clientX
		}
		if ((this.animationFrame !== undefined) || dragging.direction) {
			if (this.animationFrame !== undefined) {
				cancelAnimationFrame(this.animationFrame)
				this.animationFrame = undefined
			}
			this.onAnimationFrame(performance.now())
		}
		this.suppressNextClick()
		this.finish(true)
	}

	protected requestFrame()
	{
		if (this.animationFrame !== undefined) return
		this.animationFrame = requestAnimationFrame(time => this.onAnimationFrame(time))
	}

	protected startDragging(armed: ArmedState, pointerX: number)
	{
		if (cursorOwner) {
			this.finish(false)
			return false
		}
		const grid = this.collectGrid(armed.header)
		if (!grid) {
			this.finish(false)
			return false
		}
		const headerRow    = this.triggerRow() as HTMLTableRowElement
		const headers      = Array.from(headerRow.cells)
		const initialIndex = headers.indexOf(armed.header)
		const reorderable  = headers.map(header => this.options.isReorderable?.(header) ?? true)
		if ((initialIndex < 0) || !reorderable[initialIndex]) {
			this.finish(false)
			return false
		}

		let minimumIndex = initialIndex
		let maximumIndex = initialIndex
		while ((minimumIndex > 0) && reorderable[minimumIndex - 1]) minimumIndex --
		while ((maximumIndex < reorderable.length - 1) && reorderable[maximumIndex + 1]) maximumIndex ++
		try {
			this.of.element.setPointerCapture(armed.pointerId)
		}
		catch {
			this.finish(false)
			return false
		}

		const direction = Math.sign(pointerX - armed.lastX) as Direction
		this.state = {
			...grid,
			currentIndex: initialIndex,
			direction,
			header: armed.header,
			initialIndex,
			maximumIndex,
			minimumIndex,
			pointerId: armed.pointerId,
			pointerX,
			scrollContainer: this.closestHorizontalScrollable(),
			status: 'dragging'
		}
		cursorOwner = this
		document.documentElement.classList.add('column-reorder')
		for (const cell of grid.sourceCells) cell.classList.add('column-reorder')
		this.requestFrame()
		return true
	}

	protected structureIsCurrent(state: DraggingState)
	{
		const rows = this.tableRows()
		if ((this.triggerRow() !== state.header.parentElement) || (state.rows.length !== rows.length)) {
			return false
		}
		for (let index = 0; index < state.rows.length; index ++) {
			const row = rows[index]
			if (
				(row !== state.rows[index])
				|| (row.cells.length !== state.columnCount)
				|| (row.cells[state.currentIndex] !== state.sourceCells[index])
			) {
				return false
			}
		}

		const colGroups = Array.from(this.of.element.children).filter(element => element.tagName === 'COLGROUP')
		if (!state.colGroup) return colGroups.length === 0
		return (colGroups.length === 1)
			&& (colGroups[0] === state.colGroup)
			&& (state.colGroup.children.length === state.columnCount)
			&& (state.colGroup.children[state.currentIndex] === state.sourceCol)
	}

	protected suppressNextClick()
	{
		this.suppressClick = true
		if (this.clickTimer !== undefined) clearTimeout(this.clickTimer)
		this.clickTimer = window.setTimeout(() => {
			this.clickTimer   = undefined
			this.suppressClick = false
		})
	}

	protected tableRows()
	{
		return Array.from(this.of.element.querySelectorAll<HTMLTableRowElement>([
			':scope > thead > tr',
			':scope > tbody > tr',
			':scope > tfoot > tr'
		].join(', ')))
	}

	protected triggerRow()
	{
		return this.of.element.tHead?.rows[0] ?? this.of.element.tBodies[0]?.rows[0]
	}

}
