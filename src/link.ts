import { Plugin }        from '../../plugin/plugin.js'
import { PluginOptions } from '../../plugin/plugin.js'
import { Table }         from './table.js'

type ValueCallback = (element: Element) => ({ element: Element, value: string } | undefined)

class Options extends PluginOptions
{
	call: (url: string) => void = function(url) { window.location.href = url }
	href: string | ValueCallback = 'data-href'
	id:   string | ValueCallback = 'data-id'
	link: (href: string, id?: string) => string = function(href, id) {
		return id ? (href + (href.endsWith('/') ? '' : '/') + id) : href
	}
}

export class TableLink extends Plugin<Table, Options>
{

	constructor(options?: Partial<Options>)
	{
		super(options)
	}

	defaultOptions()
	{
		return new Options()
	}

	protected getCell(row: HTMLTableRowElement, columnIndex: number)
	{
		let current = -1
		for (const cell of Array.from(row.cells)) {
			const start = current + 1
			const end   = start + Math.max(1, cell.colSpan || 1) - 1
			if (columnIndex >= start && columnIndex <= end) {
				return cell as HTMLTableCellElement
			}
			current = end
		}
	}

	protected getCol(columnIndex: number): HTMLElement | undefined
	{
		return this.of.element.querySelector('colgroup')?.querySelectorAll('col')?.[columnIndex]
	}

	protected getHeadCell(columnIndex: number): HTMLElement | undefined
	{
		const row = this.of.element.tHead?.rows[0]
		return row ? this.getCell(row, columnIndex) : undefined
	}

	protected getHref(target: Element, attribute: string, cell: HTMLTableCellElement, idElement?: Element)
	{
		let element = target.closest('[' + attribute + ']') ?? undefined
		if (element && idElement?.contains(element)) element = undefined
		if (!element) for (const getFunc of [this.getHeadCell, this.getCol]) {
			element = getFunc.call(this, cell.cellIndex)
			if (element?.hasAttribute(attribute)) break
		}
		if (element) return { element, value: element.getAttribute(attribute) ?? '' }
	}

	protected getId(target: Element, attribute: string)
	{
		const element = target.closest('[' + attribute + ']')
		const value   = element?.getAttribute(attribute)
		if (element && value) return { element, value }
	}

	init()
	{
		for (const tBody of Array.from(this.of.element.tBodies)) {
			tBody.addEventListener('click', event => this.onClick(event))
		}
	}

	onClick(event: MouseEvent)
	{
		const target = event.target
		if (!(target instanceof Element)) return

		const cell: HTMLTableCellElement | null = target.closest('td, th')
		if (!cell || cell.querySelector('input, select, textarea')) return

		const id = (typeof this.options.id === 'function')
			? this.options.id.call(this, target)
			: this.getId(target, this.options.id)

		const href = (typeof this.options.href === 'function')
			? this.options.href.call(this, target)
			: this.getHref(target, this.options.href, cell, id?.element)
		if (!href) return

		this.options.call(this.options.link(href.value, id?.value))
	}

}
