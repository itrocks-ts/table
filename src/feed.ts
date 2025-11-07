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

		const loaded     = document.createElement('div')
		const offsetUrl  = url + (url.includes('?') ? '&' : '?') + 'offset=' + tbody.querySelectorAll(':scope > tr').length
		loaded.innerHTML = await (await fetch(offsetUrl)).text()
		const loadedBody = loaded.querySelector('table > tbody')
		if (!loadedBody) return

		while (loadedBody.firstChild) {
			tbody.append(loadedBody.firstChild)
		}
		this.observe()
	}

	observe()
	{
		const table    = this.of.element
		const lastCell = table.querySelector(':scope > tbody > tr:last-child > td:last-child')
		if (!lastCell) return

		this.observer?.disconnect()
		this.observer = new IntersectionObserver(
			async entries => entries[0].isIntersecting && this.feed(),
			{ root: table, threshold: .1 }
		)
		this.observer.observe(lastCell)
	}

}
