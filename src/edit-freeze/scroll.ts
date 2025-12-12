import { Plugin }      from '../../../plugin/plugin.js'
import { TableEdit }   from '../edit.js'
import { TableFreeze } from '../freeze.js'
import { Table }       from '../table.js'

export class TableEditFreezeScroll extends Plugin<Table>
{
	tableFreeze!: TableFreeze

	init()
	{
		this.tableFreeze = this.of.plugins.TableFreeze as TableFreeze

		const tableEdit = this.of.plugins.TableEdit as TableEdit
		const superSetSelectedCell = tableEdit.setSelectedCell
		tableEdit.setSelectedCell  = cell => superSetSelectedCell.call(tableEdit, this.scrollToCell(cell))
	}

	scrollToCell(cell: HTMLTableCellElement)
	{
		const into = this.tableFreeze.visibleInnerRect()
		const rect = cell.getBoundingClientRect()

		const cellStyle  = getComputedStyle(cell)
		const rectBottom = rect.bottom + 1 - parseFloat(cellStyle.borderBottomWidth)
		const rectRight  = rect.right  + 2 - parseFloat(cellStyle.borderRightWidth) * 2 // fine-tuning

		if (
			(rect.top      >= into.top)
			&& (rectBottom <= into.bottom)
			&& (rect.left  >= into.left)
			&& (rectRight  <= into.right)
		) {
			return cell
		}

		const scrollable = this.tableFreeze.closestScrollable(cell)
		if (!scrollable) return cell

		let shiftX = 0
		let shiftY = 0
		if (rect.top < into.top) {
			shiftY = rect.top - into.top
		}
		else if (rectBottom > into.bottom) {
			shiftY = rectBottom - into.bottom
		}
		if (rect.left < into.left) {
			shiftX = Math.floor(rect.left - into.left) // fine-tuning
		}
		else if (rectRight > into.right) {
			shiftX = rectRight - into.right
		}
		if (!shiftX && !shiftY) return cell

		if (cellStyle.position === 'sticky') {
			if ((cellStyle.left !== 'auto') || (cellStyle.right !== 'auto')) {
				shiftX = 0
			}
			if ((cellStyle.top !== 'auto') || (cellStyle.bottom !== 'auto')) {
				shiftY = 0
			}
		}
		if (!shiftX && !shiftY) return cell

		scrollable.scrollBy(shiftX, shiftY)

		return cell
	}

}
