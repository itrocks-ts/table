import { Plugin }             from '../../plugin/plugin.js'
import { PluginOptions }      from '../../plugin/plugin.js'
import type { PointerSample } from './column-reorder.js'
import { TableColumnReorder } from './column-reorder.js'
import { TableFreeze }        from './freeze.js'
import { Table }              from './table.js'

export type ColumnChange = {
	error?: unknown
	header: HTMLTableCellElement
	id: string
	state: ColumnState
}
export type ColumnContent = {
	cells: readonly HTMLTableCellElement[]
	header: HTMLTableCellElement
}
export interface ColumnOperation
{
	cancel(): void
	finish(sample: PointerSample): Promise<'added' | 'moved' | 'cancelled'>
	move(sample: PointerSample): void
}
export type ColumnResult = 'added' | 'existing'
export type ColumnSource = {
	accept?(signal: AbortSignal): Promise<void>
	create(): ColumnContent
	id: string
	load?(signal: AbortSignal): Promise<ColumnContent>
}
export type ColumnState = 'cancelled' | 'committed' | 'error' | 'loaded' | 'provisional'
export interface ColumnTransaction
{
	readonly header: HTMLTableCellElement
	readonly id: string
	readonly ready: Promise<void>
	readonly state: 'cancelled' | 'committed' | 'provisional'
	cancel(): void
	commit(): ColumnResult
	moveTo(index: number): void
}

interface Pending
{
	abort: AbortController
	col?: HTMLTableColElement
	content: ColumnContent
	initial: number
	rows: HTMLTableRowElement[]
	settled: boolean
	source: ColumnSource
	started?: number
	transaction: ColumnTransaction
}

export class TableColumnAdd extends Plugin<Table, TableColumnAddOptions>
{
	protected disposed = false
	protected external?: ColumnOperation
	protected highlights = new Map<HTMLTableCellElement, ReturnType<typeof setTimeout> | undefined>()
	protected identities = new WeakMap<HTMLTableCellElement, string>()
	protected pending = new Map<string, Pending>()
	protected removals = new Map<string, { abort: AbortController; promise: Promise<boolean> }>()
	protected reorder!: TableColumnReorder

	add(source: ColumnSource): Promise<ColumnResult>
	{
		try {
			if (this.disposed) throw new Error('Column addition is disposed')
			if (this.find(source.id)) {
				this.reveal(source.id)
				this.highlight(source.id)
				return Promise.resolve('existing')
			}
			const operation = this.begin(source)
			const result    = operation.commit()
			this.reveal(source.id)
			return Promise.resolve(result)
		}
		catch (error) {
			return Promise.reject(error)
		}
	}

	/** Create a provisional column without installing pointer transport. */
	begin(source: ColumnSource): ColumnTransaction
	{
		return this.create(source)
	}

	/** Add or move an opaque column through the existing reorder geometry. */
	beginExternal(source: ColumnSource, sample: PointerSample): ColumnOperation
	{
		if (this.disposed || this.external) throw new Error('Column addition is unavailable')
		if (this.pending.get(source.id)?.transaction.state === 'provisional')
			throw new Error('Column addition is pending')
		const existing = this.find(source.id)
		const initial = existing?.cellIndex
		const transaction = existing ? undefined : this.create(source, true)
		let reorder: ReturnType<TableColumnReorder['beginExternal']> | undefined
		const enter = (point: PointerSample) => {
			if (reorder || point.pointerId !== sample.pointerId) return
			const table = this.of.element
			if (!existing && !table.contains(table.ownerDocument.elementFromPoint(point.clientX, point.clientY))) return
			try {
				if (transaction) {
					const entry = this.pending.get(source.id)!
					for (const cell of [entry.content.header, ...entry.content.cells]) cell.hidden = false
					if (entry.col) entry.col.hidden = false
					this.refresh()
				}
				reorder = this.reorder.beginExternal(existing ?? transaction!.header, point)
			}
			catch (error) {
				operation.cancel()
				throw error
			}
		}
		let complete = false
		let finishing = false
		const abort = new AbortController()
		const acceptance = Promise.resolve().then(() => source.accept?.(abort.signal))
		// Keep a rejected admission observable at finish without an unhandled rejection during transport.
		void acceptance.catch(() => {})
		const operation: ColumnOperation = {
			cancel: () => {
				if (complete) return
				complete = true
				abort.abort()
				reorder?.cancel()
				if (initial !== undefined) this.reorder.moveColumn(this.find(source.id)!, initial)
				transaction?.cancel()
				this.external = undefined
				this.refresh()
			},
			finish: async point => {
				if (complete || finishing) return 'cancelled'
				finishing = true
				enter(point)
				if (!reorder?.hold(point)) {
					operation.cancel()
					return 'cancelled'
				}
				try { await acceptance }
				catch (error) {
					operation.cancel()
					throw error
				}
				if (complete) return 'cancelled'
				if (!reorder.finish(point)) {
					operation.cancel()
					return 'cancelled'
				}
				complete = true
				this.external = undefined
				if (transaction) transaction.commit()
				else this.options.onChange?.({ header: this.find(source.id)!, id: source.id, state: 'committed' })
				this.refresh()
				return existing ? 'moved' : 'added'
			},
			move: point => {
				if (complete || finishing) return
				enter(point)
				reorder?.move(point)
			}
		}
		this.external = operation
		enter(sample)
		return operation
	}

	protected create(source: ColumnSource, hidden = false): ColumnTransaction
	{
		if (this.disposed) throw new Error('Column addition is disposed')
		const pending = this.pending.get(source.id)
		if (pending && pending.content.header.parentElement === this.headers()) return pending.transaction
		if (pending) {
			pending.abort.abort()
			this.pending.delete(source.id)
		}
		const headers  = this.headers()
		const existing = this.find(source.id)
		const rows     = Array.from(this.of.element.rows).filter(row => row !== headers)
		const content  = existing
			? { header: existing, cells: rows.map(row => row.cells[existing.cellIndex]) }
			: source.create()
		this.validate(content, rows)
		if (!existing && [content.header, ...content.cells].some(cell => cell.parentElement))
			throw new Error('New column content must be detached')
		const abort = new AbortController()
		let state: ColumnTransaction['state'] = 'provisional'
		let ready = Promise.resolve()
		const transaction: ColumnTransaction = {
			get header() { return entry.content.header },
			id: source.id,
			get ready() { return ready },
			get state() { return state },
			cancel: () => {
				if (state !== 'provisional') return
				state = 'cancelled'
				abort.abort()
				this.pending.delete(source.id)
				if (existing) this.reorder.moveColumn(entry.content.header, entry.initial)
				else {
					for (const cell of [entry.content.header, ...entry.content.cells]) cell.remove()
					entry.col?.remove()
				}
				this.refresh()
				this.notify(entry, 'cancelled')
			},
			commit: () => {
				if (state === 'cancelled') throw new Error('Column transaction was cancelled')
				if (state === 'committed') return 'existing'
				state = 'committed'
				this.mark(entry, 'provisional', false)
				if (!existing || (entry.content.header.cellIndex !== entry.initial)) this.notify(entry, 'committed')
				if (!existing) {
					entry.started = performance.now()
					this.highlight(source.id, true)
				}
				if (existing || !source.load || (entry.settled && !entry.content.header.classList.contains('column-add-error')))
					this.pending.delete(source.id)
				return existing ? 'existing' : 'added'
			},
			moveTo: index => {
				if (!Number.isFinite(index)) throw new Error('Column index must be finite')
				if (state !== 'provisional') return
				this.reorder.moveColumn(entry.content.header, index)
				this.refresh()
			}
		}
		const entry: Pending = { abort, content, initial: existing?.cellIndex ?? -1,
			rows, settled: false, source, transaction }
		this.pending.set(source.id, entry)
		if (existing) return transaction
		if (hidden) for (const cell of [content.header, ...content.cells]) cell.hidden = true
		this.identities.set(content.header, source.id)
		content.header.dataset.columnId = source.id
		const freeze = this.of.plugins.TableFreeze
		const index  = headers.cells.length - (freeze instanceof TableFreeze ? freeze.rightColumnCount : 0)
		headers.insertBefore(content.header, headers.cells[index] ?? null)
		rows.forEach((row, number) => row.insertBefore(content.cells[number], row.cells[index] ?? null))
		const group = this.of.element.querySelector('colgroup')
		if (group) {
			entry.col = document.createElement('col')
			entry.col.hidden = hidden
			group.insertBefore(entry.col, group.children[index] ?? null)
		}
		this.mark(entry, 'provisional', true)
		this.refresh()
		this.notify(entry, 'provisional')
		if (source.load) ready = this.load(entry)
		return transaction
	}

	defaultOptions()
	{
		return new TableColumnAddOptions()
	}

	dispose()
	{
		this.external?.cancel()
		this.disposed = true
		for (const removal of this.removals.values()) removal.abort.abort()
		this.removals.clear()
		for (const entry of [...this.pending.values()]) {
			entry.transaction.cancel()
			entry.abort.abort()
			this.mark(entry, 'loading', false)
		}
		this.pending.clear()
		for (const [cell, timer] of this.highlights) {
			clearTimeout(timer)
			cell.classList.remove('column-add-highlight', 'column-add-new', 'column-add-opening')
			for (const name of ['fade', 'from', 'height', 'width']) cell.style?.removeProperty(`--column-${name}`)
		}
		this.highlights.clear()
	}

	protected find(id: string)
	{
		return Array.from(this.headers().cells).find(header =>
			(this.identities.get(header) ?? this.options.identify(header)) === id)
	}

	protected headers()
	{
		const row = this.of.element.tHead?.rows[0]
		if (!row) throw new Error('Column addition requires one header row')
		return row
	}

	highlight(id: string, opening = false)
	{
		const header = this.find(id)
		if (!header || this.disposed) return
		const started = opening ? this.pending.get(id)?.started : undefined
		const duration = started === undefined ? 350 : Math.max(100, 350 - (performance.now() - started))
		const waiting = opening && header.classList.contains('column-add-loading')
		for (const row of Array.from(this.of.element.rows)) {
			const cell = row.cells[header.cellIndex]
			if (!cell) continue
			clearTimeout(this.highlights.get(cell))
			cell.classList.remove('column-add-highlight', 'column-add-new', 'column-add-opening')
		}
		this.measureColumn(header)
		void header.offsetWidth
		for (const row of Array.from(this.of.element.rows)) {
			const cell = row.cells[header.cellIndex]
			if (!cell) continue
			cell.classList.toggle('column-add-new', opening)
			cell.classList.toggle('column-add-opening', opening)
			cell.classList.add('column-add-highlight')
			cell.style?.setProperty('--column-fade', `${duration}ms`)
			this.highlights.set(cell, waiting ? undefined : setTimeout(() => {
				cell.classList.remove('column-add-highlight', 'column-add-new', 'column-add-opening')
				this.highlights.delete(cell)
				for (const name of ['fade', 'from', 'height', 'width']) cell.style?.removeProperty(`--column-${name}`)
				if (!this.highlights.size) this.refresh()
			}, duration))
		}
		if (opening && header.ownerDocument) setTimeout(() => {
			if (this.disposed || !header.isConnected) return
			header.classList.remove('column-add-opening')
			this.refresh()
		}, 100)
	}

	init()
	{
		this.disposed = false
		const reorder = this.of.plugins.TableColumnReorder
		if (!(reorder instanceof TableColumnReorder)) throw new Error('Configure TableColumnReorder before TableColumnAdd')
		this.reorder = reorder
		this.of.onReset.push(() => this.dispose())
	}

	protected live(entry: Pending)
	{
		return !this.disposed && !entry.abort.signal.aborted && (this.pending.get(entry.source.id) === entry)
			&& entry.content.header.parentElement === this.headers()
	}

	protected async load(entry: Pending)
	{
		this.mark(entry, 'loading', true)
		try {
			const content = await entry.source.load!(entry.abort.signal)
			if (!this.live(entry)) return
			this.validate(content, entry.rows)
			if ([content.header, ...content.cells].some(cell => cell.parentElement))
				throw new Error('Loaded column content must be detached')
			// A consumer must reload changed row views; stale positional data is never applied.
			const rows = Array.from(this.of.element.rows).filter(row => row !== this.headers())
			if ((rows.length !== entry.rows.length) || rows.some((row, index) => row !== entry.rows[index])) {
				throw new Error('Column row view changed during loading')
			}
			const old = entry.content
			const opening = old.header.classList.contains('column-add-opening')
			const width = old.header.getBoundingClientRect?.().width ?? 0
			const target = parseFloat(old.header.style?.getPropertyValue('--column-width') ?? '') || width
			for (const cell of [old.header, ...old.cells]) {
				clearTimeout(this.highlights.get(cell))
				this.highlights.delete(cell)
			}
			for (const cell of [content.header, ...content.cells]) cell.hidden = old.header.hidden
			this.reorder.replaceCell(old.header, content.header)
			old.cells.forEach((cell, index) => this.reorder.replaceCell(cell, content.cells[index]))
			entry.content = content
			this.identities.set(content.header, entry.source.id)
			content.header.dataset.columnId = entry.source.id
			const removing = old.header.classList.contains('column-remove-highlight')
			if (removing) {
				this.measureColumn(content.header, width)
				for (const cell of [content.header, ...content.cells]) cell.classList.add('column-remove-highlight')
			}
			this.mark(entry, 'provisional', entry.transaction.state === 'provisional')
			this.mark(entry, 'loading', false)
			this.refresh()
			this.notify(entry, 'loaded')
			if (!removing && entry.transaction.state === 'committed') {
				for (const cell of [content.header, ...content.cells]) {
					cell.style?.setProperty('--column-from', `${width}px`)
					cell.style?.setProperty('--column-width', `${target}px`)
				}
				this.highlight(entry.source.id, true)
				if (!opening) content.header.classList.remove('column-add-opening')
			}
		}
		catch (error) {
			if (!this.live(entry)) return
			this.mark(entry, 'loading', false)
			this.mark(entry, 'error', true)
			this.notify(entry, 'error', error)
			for (const cell of [entry.content.header, ...entry.content.cells]) {
				clearTimeout(this.highlights.get(cell))
				this.highlights.delete(cell)
				cell.classList.remove('column-add-highlight', 'column-add-new', 'column-add-opening')
				for (const name of ['fade', 'from', 'height', 'width']) cell.style?.removeProperty(`--column-${name}`)
			}
			this.refresh()
		}
		finally {
			entry.settled = true
			if (entry.transaction.state !== 'provisional' && this.pending.get(entry.source.id) === entry
				&& !entry.content.header.classList.contains('column-add-error'))
				this.pending.delete(entry.source.id)
		}
	}

	protected mark(entry: Pending, state: 'error' | 'loading' | 'provisional', present: boolean)
	{
		for (const cell of [entry.content.header, ...entry.content.cells]) {
			cell.classList.toggle(`column-add-${state}`, present)
			if (state === 'loading') present ? cell.setAttribute('aria-busy', 'true') : cell.removeAttribute('aria-busy')
		}
	}

	protected measureColumn(header: HTMLTableCellElement, width?: number)
	{
		if (!header.ownerDocument) return
		width ??= Math.max(
			header.getBoundingClientRect().width, parseFloat(header.style.getPropertyValue('--column-width')) || 0
		)
		const cells = Array.from(this.of.element.rows).map(row => row.cells[header.cellIndex])
		const heights = cells.map(cell => cell.getBoundingClientRect().height)
		cells.forEach((cell, index) => {
			cell.style.setProperty('--column-width', `${width}px`)
			cell.style.setProperty('--column-height', `${heights[index]}px`)
		})
	}

	protected notify(entry: Pending, state: ColumnState, error?: unknown)
	{
		this.options.onChange?.({ error, header: entry.content.header, id: entry.source.id, state })
	}

	protected refresh()
	{
		const freeze = this.of.plugins.TableFreeze
		if (freeze instanceof TableFreeze) freeze.refresh()
		this.of.refreshStyleSheets()
	}

	/** Reveal and briefly mark a column in red before removing it. */
	remove(id: string, signal?: AbortSignal): Promise<boolean>
	{
		const pending = this.removals.get(id)
		if (pending) return pending.promise
		if (this.disposed || signal?.aborted || !this.find(id)) return Promise.resolve(false)
		if (this.external || this.pending.get(id)?.transaction.state === 'provisional')
			return Promise.reject(new Error('A column interaction is active'))
		const abort = new AbortController()
		const cancelled = AbortSignal.any([abort.signal, ...(signal ? [signal] : [])])
		const promise = this.removeColumn(id, cancelled).finally(() => {
			if (this.removals.get(id)?.abort === abort) this.removals.delete(id)
		})
		this.removals.set(id, { abort, promise })
		return promise
	}

	protected async removeColumn(id: string, signal: AbortSignal): Promise<boolean>
	{
		this.reveal(id)
		const header = this.find(id)!
		const cells = Array.from(this.of.element.rows).map(row => row.cells[header.cellIndex]).filter(Boolean)
		this.measureColumn(header, header.getBoundingClientRect?.().width ?? 0)
		for (const cell of cells) {
			clearTimeout(this.highlights.get(cell))
			this.highlights.delete(cell)
			cell.classList.remove('column-add-highlight', 'column-add-new', 'column-add-opening')
			cell.classList.add('column-remove-highlight')
		}
		try {
			await new Promise<void>(resolve => {
				const finish = () => {
					clearTimeout(timer)
					signal.removeEventListener('abort', finish)
					resolve()
				}
				const timer = setTimeout(finish, 300)
				signal.addEventListener('abort', finish, { once: true })
			})
			const current = this.find(id)
			if (this.disposed || signal.aborted || !current) return false
			if (!this.reorder.removeColumn(current)) return false
			const entry = this.pending.get(id)
			entry?.abort.abort()
			this.pending.delete(id)
			this.refresh()
			return true
		}
		finally {
			const current = this.find(id)
			if (current) cells.push(...Array.from(this.of.element.rows).map(row => row.cells[current.cellIndex]))
			for (const cell of cells) {
				cell?.classList.remove('column-remove-highlight')
				for (const name of ['fade', 'from', 'height', 'width']) cell?.style?.removeProperty(`--column-${name}`)
			}
			this.refresh()
		}
	}

	reveal(id: string)
	{
		const header = this.find(id)
		if (!header || this.disposed) return
		const scroll = this.reorder.scrollContainer()
		if (!scroll) return
		const bounds = scroll.getBoundingClientRect()
		const freeze = this.of.plugins.TableFreeze
		const inner  = freeze instanceof TableFreeze ? freeze.visibleInnerRect() : bounds
		const rect   = header.getBoundingClientRect()
		const left   = Math.max(bounds.left, inner.left)
		const right  = Math.min(bounds.right, inner.right)
		if (right <= left) return
		// A wide column already covering the inner area needs no scroll in either direction.
		if ((rect.left < left) && (rect.right < right))
			scroll.scrollLeft += Math.max(rect.left - left, rect.right - right)
		else if ((rect.right > right) && (rect.left > left))
			scroll.scrollLeft += Math.min(rect.right - right, rect.left - left)
	}

	retry(id: string): Promise<void>
	{
		const entry = this.pending.get(id)
		if (!entry || !this.live(entry) || !entry.content.header.classList.contains('column-add-error'))
			return Promise.resolve()
		entry.rows = Array.from(this.of.element.rows).filter(row => row !== this.headers())
		entry.content = {
			cells: entry.rows.map(row => row.cells[entry.content.header.cellIndex]), header: entry.content.header
		}
		this.mark(entry, 'error', false)
		return this.load(entry)
	}

	protected validate(content: ColumnContent, rows: HTMLTableRowElement[])
	{
		const headers = this.headers()
		const columns = this.of.element.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')
		if (this.of.element.querySelectorAll(':scope > colgroup').length > 1)
			throw new Error('Column addition supports one column group')
		if (columns.length && (columns.length !== headers.cells.length
			|| Array.from(columns).some(column => column.span !== 1)))
			throw new Error('Column groups must contain one unspanned col per column')
		if ((this.of.element.tHead!.rows.length !== 1) || (content.cells.length !== rows.length))
			throw new Error('Column content must match the current single-header row view')
		const cells = [content.header, ...content.cells]
		if ((new Set(cells).size !== cells.length) || cells.some(cell => !['TD', 'TH'].includes(cell.tagName)
			|| cell.colSpan !== 1 || cell.rowSpan !== 1)) throw new Error('Column cells must be distinct, unspanned cells')
		if (Array.from(this.of.element.rows).some(row => row.cells.length !== headers.cells.length
			|| Array.from(row.cells).some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1)))
			throw new Error('Column addition requires a rectangular table without spans')
	}

}

export class TableColumnAddOptions extends PluginOptions
{
	identify: (header: HTMLTableCellElement) => string | undefined = header => header.dataset.columnId
	onChange?: (change: ColumnChange) => void
}
