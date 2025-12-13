import { Plugin }        from '../../plugin/plugin.js'
import { PluginOptions } from '../../plugin/plugin.js'
import { Table }         from './table.js'

type AttributeValue = string | string[] | ValueCallback
type ElementValue   = { element: Element, value: string }
type ValueCallback  = (element: Element) => (ElementValue | undefined)

class Options extends PluginOptions
{
	call: (url: string) => void = function(url) { window.location.href = url }
	href: AttributeValue = ['data-href', 'data-link']
	id:   AttributeValue = 'data-id'
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

	protected getClosestElement(target: Element, attributes: string[])
	{
		return target.closest('[' + attributes.join('],[') + ']') ?? undefined
	}

	protected getCol(columnIndex: number): HTMLElement | undefined
	{
		return this.of.element.querySelector('colgroup')?.querySelectorAll('col')?.[columnIndex]
	}

	protected getElementValue(element: Element | undefined, attributes: string[]): ElementValue | undefined
	{
		if (!element) return
		for (const attribute of attributes) {
			if (element?.hasAttribute(attribute)) {
				return { element, value: element.getAttribute(attribute) ?? '' }
			}
		}
	}

	protected getHeadCell(columnIndex: number): HTMLElement | undefined
	{
		const row = this.of.element.tHead?.rows[0]
		return row ? this.getCell(row, columnIndex) : undefined
	}

	protected getHref(target: Element, attributes: string | string[], cell: HTMLTableCellElement, idElement?: Element)
	{
		if (typeof attributes === 'string') attributes = [attributes]
		let element = this.getClosestElement(target, attributes)
		if (element && idElement?.contains(element)) element = undefined
		if (element) return this.getElementValue(element, attributes)
		for (const getFunc of [this.getHeadCell, this.getCol]) {
			element     = getFunc.call(this, cell.cellIndex)
			const value = this.getElementValue(element, attributes)
			if (value) return value
		}
	}

	protected getId(target: Element, attributes: string | string[])
	{
		if (typeof attributes === 'string') attributes = [attributes]
		const element = this.getClosestElement(target, attributes)
		return this.getElementValue(element, attributes)
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
