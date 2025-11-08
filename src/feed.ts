import { Plugin } from '../../plugin/plugin.js'
import { Table }  from './table.js'

export class TableFeed extends Plugin<Table>
{

	observer: IntersectionObserver | undefined = undefined

	constructor(table: Table)
	{
		super(table)
		this.observe()
	}

	async feed()
	{
		const table = this.of.element
		const tbody = table.querySelector(':scope > tbody')
		const url   = table.dataset.feed ?? table.closest<HTMLFormElement>('form[action]')?.action
		if (!tbody || !url) return

		const offset      = tbody.querySelectorAll(':scope > tr').length
		const offsetUrl   = url + (url.includes('?') ? '&' : '?') + 'offset=' + offset
		const visibleRows = Math.ceil(tbody.clientHeight / offset)
		const requestInit = { headers: { 'xhr-visible-rows': String(visibleRows) } }

		const loaded      = document.createElement('div')
		loaded.innerHTML  = await (await fetch(offsetUrl, requestInit)).text()
		const container   = loaded.querySelector('tbody > tr')?.parentElement ?? loaded.querySelector('tr')?.parentElement
		if (!container) return

		while (container.firstChild) {
			tbody.append(container.firstChild)
		}
		this.observe()
	}

	observe()
	{
		const table    = this.of.element
		const lastCell = table.querySelector(':scope > tbody > tr:last-child')
			?? table.querySelector(':scope > tr:last-child')
		if (!lastCell) return

		this.observer?.disconnect()
		this.observer = new IntersectionObserver(
			async entries => entries[0].isIntersecting && this.feed(),
			{ root: table, threshold: .1 }
		)
		this.observer.observe(lastCell)
	}

}
