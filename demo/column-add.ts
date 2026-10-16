import { Plugin }                  from '../../plugin/plugin.js'
import { ColumnChange }             from '../column-add.js'
import { ColumnContent }            from '../column-add.js'
import { ColumnTransaction }        from '../column-add.js'
import { TableColumnAdd }           from '../column-add.js'
import { TableColumnReorder }       from '../column-reorder.js'
import { TableColumnReorderFreeze } from '../column-reorder-freeze.js'
import { TableFreeze }              from '../freeze.js'
import { Table }                    from '../table.js'

const element = document.querySelector('table')!
const events: unknown[] = []
const status = document.querySelector('output')!
let attempt = 0
let preview: ColumnTransaction | undefined
let table: Table

function log(change: ColumnChange | string)
{
	events.push(typeof change === 'string' ? change
		: { error: String(change.error ?? ''), id: change.id, state: change.state })
	document.querySelector('#events')!.textContent = JSON.stringify(events, null, 2)
}

function content(label: string): ColumnContent
{
	const header = document.createElement('th')
	header.textContent = label
	return { header, cells: Array.from(element.tBodies[0].rows, (_, index) => {
		const cell = document.createElement('td')
		cell.textContent = `${label} / ${index + 1}`
		return cell
	}) }
}

function source(id: string, delay = 250, failure = false)
{
	return { id, create: () => content('Loading'), load: async (_signal: AbortSignal) => {
		await new Promise(resolve => setTimeout(resolve, delay))
		if (failure && attempt ++ === 0) throw new Error('Synthetic values unavailable')
		return content(`Metric ${id}`)
	} }
}

function install()
{
	table = new Table(element, { plugins: [
		new TableColumnReorder({ onRemove: header => log(`removed:${header.dataset.columnId}`),
			onReorder: header => log(`reordered:${header.dataset.columnId}`) }),
		TableFreeze, TableColumnReorderFreeze, new TableColumnAdd({ onChange: log }), FixtureSort
	] })
}

class FixtureSort extends Plugin<Table>
{

	init()
	{
		this.of.addEventListener(this.of.element.tHead!, 'click', event => {
			const header = (event.target as Element).closest('th')
			if (header?.dataset.columnId) log(`sort:${header.dataset.columnId}`)
		})
	}

}

const addition = () => table.plugins.TableColumnAdd as TableColumnAdd
const bind = (id: string, action: () => unknown) => document.getElementById(id)!.addEventListener('click', async () => {
	try { status.textContent = String(await action()) }
	catch (error) { status.textContent = String(error) }
})
install()
bind('add', () => addition().add(source('opaque/metric:7')))
bind('slow', () => addition().add(source('slow', 1800)))
bind('fail', () => addition().add(source('failure', 300, true)))
bind('retry', () => addition().retry('failure'))
bind('invalid', () => addition().add({
	create: () => { throw new Error('Synthetic creation failure') }, id: 'invalid'
}))
bind('preview', () => { preview = addition().begin(source('preview', 1600)); return preview.state })
bind('cancel', () => { preview?.cancel(); return preview?.state })
bind('dispose', () => { addition().dispose(); return 'disposed' })
bind('reset', () => { table = table.reset(); return 'reset' })
Object.assign(window, { tableRecipe: { addition, content, events, source, table: () => table } })
