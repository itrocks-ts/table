import { HTMLEditableElement } from '../../node_modules/@itrocks/contenteditable/contenteditable.js'
import Plugin                  from '../../node_modules/@itrocks/plugin/plugin.js'
import TableEdit               from '../edit.js'
import TableFreeze             from '../freeze.js'
import Table                   from '../table.js'

const zIndex = {
	back:     false,
	editable: '',
	selected: ''
}

export default class TableEditFreezeHide extends Plugin<Table>
{
	readonly tableFreeze: TableFreeze
	readonly tableEdit:   TableEdit

	constructor(table: Table)
	{
		super(table)

		const tableEdit   = this.tableEdit   = table.plugins.TableEdit   as TableEdit
		const tableFreeze = this.tableFreeze = table.plugins.TableFreeze as TableFreeze

		const scrollable = this.tableFreeze.closestScrollable(table.element)
		if (!scrollable) return

		tableFreeze.full = { column: '2', corner: '6', row: '4' }
		tableEdit.zIndex = '7'

		table.addEventListener(scrollable, 'scroll', () => this.autoHide())
		table.addEventListener(window,     'resize', () => this.autoHide())

		const superCreateEditable = tableEdit.createEditable
		tableEdit.createEditable = (selected, selectedStyle) => this.addEditableEventListeners(
			superCreateEditable.call(tableEdit, selected, selectedStyle)
		)
	}

	addEditableEventListeners(editable: HTMLEditableElement)
	{
		zIndex.back = false
		this.autoHide()
		const goAhead = () => this.goAhead()
		editable.addEventListener('keydown', goAhead)
		editable.addEventListener('keyup',   goAhead)
		editable.addEventListener('click',   goAhead)
		return editable
	}

	autoHide()
	{
		const editable = this.tableEdit.editable()
		const selected = this.tableEdit.selected()
		if (!editable || !selected) return

		const into = this.tableFreeze.visibleInnerRect()
		const rect = selected.getBoundingClientRect()

		let freezeColumn = false
		let freezeRow    = false

		const style  = getComputedStyle(selected)
		const sticky = (style.position === 'sticky') ? '1' : ''
		if (sticky) {
			freezeColumn = (style.left !== 'auto') || (style.right !== 'auto')
			freezeRow    = (style.top !== 'auto') || (style.bottom !== 'auto')
		}

		const backHorizontal = !freezeColumn && ((rect.left < into.left) || (rect.right > into.right))
		const backVertical   = !freezeRow    && ((rect.top < into.top) || (rect.bottom > into.bottom))

		if (backHorizontal || backVertical) {
			this.goBack()
		}
		else {
			this.goAhead()
		}
	}

	goAhead()
	{
		const editable = this.tableEdit.editable()
		const selected = this.tableEdit.selected()
		if (!zIndex.back || !editable || !selected) return

		zIndex.editable.length ? (editable.style.zIndex = zIndex.editable) : editable.style.removeProperty('z-index')
		zIndex.selected.length ? (selected.style.zIndex = zIndex.selected) : selected.style.removeProperty('z-index')

		zIndex.back     = false
		zIndex.editable = ''
		zIndex.selected = ''
	}

	goBack()
	{
		const editable = this.tableEdit.editable()
		const selected = this.tableEdit.selected()
		if (zIndex.back || !editable || !selected) return

		zIndex.back     = true
		zIndex.editable = editable.style.zIndex
		zIndex.selected = selected.style.zIndex

		selected.style.removeProperty('z-index')
		const style    = getComputedStyle(selected)
		const newIndex = (parseInt((style.zIndex === 'auto') ? '0' : style.zIndex) + 1).toString()
		selected.style.zIndex = newIndex
		editable.style.zIndex = newIndex
	}

}
