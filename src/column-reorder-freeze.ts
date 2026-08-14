import { Plugin }             from '../../plugin/plugin.js'
import { Table }              from './table.js'
import { TableColumnReorder } from './column-reorder.js'
import { TableFreeze }        from './freeze.js'

export class TableColumnReorderFreeze extends Plugin<Table>
{

	init()
	{
		const freeze  = this.of.plugins.TableFreeze
		const reorder = this.of.plugins.TableColumnReorder
		if (!(freeze instanceof TableFreeze) || !(reorder instanceof TableColumnReorder)) return
		if (reorder.options.isReorderable !== undefined) return

		reorder.options.isReorderable = header => {
			const index = this.of.cellColumnNumber(header)
			return (index >= freeze.leftColumnCount) && (index < freeze.columns.length - freeze.rightColumnCount)
		}
	}

}
