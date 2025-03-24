import { Plugin }                 from '../../node_modules/@itrocks/plugin/plugin.js'
import { TableFreeze }            from '../freeze.js'
import { HTMLTableFreezeElement } from '../freeze.js'
import { Table }                  from '../table.js'

/**
 * This plugin has no use and no effect if your table has border-collapse: separate (default)
 */
export class TableFreezeInheritBorder extends Plugin<Table>
{
	tableStyle:  CSSStyleDeclaration
	tableFreeze: TableFreeze

	constructor(table: Table)
	{
		super(table)
		this.tableFreeze = table.plugins.TableFreeze as TableFreeze

		this.tableStyle = getComputedStyle(table.element)
		if (this.tableStyle.borderCollapse !== 'collapse') return

		const superPosition    = this.tableFreeze.position
		this.tableFreeze.position = (position, counter, colCell, side) => superPosition.call(
			this.of.plugins.TableFreeze, this.position(position, counter, colCell, side), counter, colCell, side
		)
	}

	init()
	{
		if (this.tableStyle.borderCollapse !== 'collapse') return
		const tableFreeze = this.tableFreeze
		const table    = this.of

		// table
		table.styleSheet.push(`
			${table.selector} {
				border-collapse: separate;
				border-spacing: 0;
			}
		`)
		// columns
		let rightSelector = ''
		if (tableFreeze.rightColumnCount) {
			rightSelector = `:not(:nth-last-child(${tableFreeze.rightColumnCount}))`
			table.styleSheet.push(`
				${table.selector} > * > tr > :nth-last-child(${tableFreeze.rightColumnCount + 1}) {
					border-right-width: 0;
				}
			`)
		}
		table.styleSheet.push(`
			${table.selector} > * > tr > :not(:first-child)${rightSelector} {
				border-left-width: 0;
			}
		`)
		// rows
		if (table.element.tHead?.rows.length) {
			table.styleSheet.push(`
				${table.selector} > tbody > tr > *,
				${table.selector} > thead > tr:not(:first-child) > * {
					border-top-width: 0;
				}
			`)
		}
		else {
			table.styleSheet.push(`
				${table.selector} > tbody > tr:not(:first-child) > * {
					border-top-width: 0;
				}
			`)
		}
		if (table.element.tFoot?.rows.length) {
			table.styleSheet.push(`
				${table.selector} > tbody > tr:last-child > *,
				${table.selector} > tfoot > tr:not(:last-child) > * { 
					border-bottom-width: 0;
				}
			`)
		}
	}

	position(position: number, counter: number, colCell: HTMLTableFreezeElement, side: 'bottom'|'left'|'right'|'top')
	{
		const width = parseFloat(getComputedStyle(colCell).borderWidth) / 2
		const shift = (counter > 1) ? width : -width
		position += (side === 'bottom') || (side === 'right')
			? Math.ceil(shift)
			: Math.floor(shift)
		return position
	}

}
