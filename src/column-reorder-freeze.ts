import { Plugin }             from '../../plugin/plugin.js'
import { TableColumnReorder } from './column-reorder.js'
import { TableFreeze }        from './freeze.js'
import { Table }              from './table.js'

export class TableColumnReorderFreeze extends Plugin<Table>
{

	init()
	{
		const reorder = this.of.plugins.TableColumnReorder
		const freeze  = this.of.plugins.TableFreeze
		if (!(reorder instanceof TableColumnReorder) || !(freeze instanceof TableFreeze)) return
		if (reorder.options.isReorderable !== undefined) return

		reorder.options.isReorderable = header => {
			const index = this.of.cellColumnNumber(header)
			console.log('freeze', freeze)
			const reorderable = (index >= freeze.leftColumnCount) && (index < freeze.columns.length - freeze.rightColumnCount)
			console.debug('reorderable of', index, '=', reorderable ? 'true' : 'false')
			return reorderable
		}
	}

}
