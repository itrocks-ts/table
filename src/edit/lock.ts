import { Plugin }        from '../../../plugin/plugin.js'
import { PluginOptions } from '../../../plugin/plugin.js'
import { TableEdit }     from '../edit.js'
import { Table }         from '../table.js'

class Options extends PluginOptions
{
	nonEditableConditions: { [index: string]: string } = {
		'closest': 'tfoot, thead, [data-lock]',
		'col':     '[data-lock]'
	}
}

export class TableEditLock extends Plugin<Table, Options>
{

	colCell(cell: HTMLTableCellElement)
	{
		const table    = cell.closest('table') as HTMLTableElement
		const position = this.of.cellColumnNumber(cell)
		const col      = table.querySelector(':scope > colgroup')
		if (col) {
			return col.children[position] as HTMLTableColElement
		}
		const sections: NodeListOf<HTMLTableSectionElement> = table.querySelectorAll(
			':scope > tbody, :scope > tfoot, :scope > thead'
		)
		const cellTr = cell.closest('tr')
		let foreignRow: HTMLTableRowElement | undefined
		sections.forEach(section => {
			if (foreignRow) return
			let tr = section.firstElementChild as HTMLTableRowElement ?? undefined
			if (!tr) return
			if (cellTr === tr) {
				tr = tr.nextElementSibling as HTMLTableRowElement ?? undefined
			}
			if (!tr) return
			foreignRow = tr
		})
		return foreignRow?.children[position] as HTMLTableCellElement ?? cell
	}

	closestEditableCell(editable?: HTMLTableCellElement)
	{
		let style: CSSStyleDeclaration | undefined
		for (const [index, value] of Object.entries(this.options.nonEditableConditions)) {
			if (!editable) return
			switch (index) {
				case 'closest':
					if (editable.closest(value)) editable = undefined
					break
				case 'col':
					if (this.colCell(editable).matches(value)) editable = undefined
					break
				default:
					style ??= getComputedStyle(editable)
					if (style[index as keyof CSSStyleDeclaration] === value) editable = undefined
			}
		}
		return editable
	}

	defaultOptions()
	{
		return new Options()
	}

	init()
	{
		const tableEdit = this.of.plugins.TableEdit as TableEdit
		const superClosestEditableCell = tableEdit.closestEditableCell
		tableEdit.closestEditableCell = target => this.closestEditableCell(superClosestEditableCell.call(tableEdit, target))
	}

}
