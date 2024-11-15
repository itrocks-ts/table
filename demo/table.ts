import TableColumnReorder           from '../src/column-reorder.js'
import TableFreeze                  from '../src/freeze.js'
import TableFreezeInheritBackground from '../src/freeze/inherit-background.js'
import TableFreezeInheritBorder     from '../src/freeze/inherit-border.js'
import { Options, tableBySelector } from '../src/table.js'
import TableEdit                    from '../src/edit.js'
import TableEditLock                from '../src/edit/lock.js'
import TableEditMove                from '../src/edit/move.js'
import TableEditFreezeHide          from '../src/edit-freeze/hide.js'
import TableEditFreezeScroll        from '../src/edit-freeze/scroll.js'

const options: Partial<Options> = {
	plugins: [
		TableColumnReorder,
		TableEdit,
		TableEditLock,
		TableEditMove,
		TableFreeze,
		TableFreezeInheritBackground,
		TableFreezeInheritBorder,
		TableEditFreezeHide,
		TableEditFreezeScroll
	]
}

let tables = tableBySelector('table', options)

addEventListener('resize', () => { setTimeout(() => (tables = tables.map(table => table.reset()))) })
