import { Plugin } from '../../plugin/plugin.js'
import { Table }  from './table.js'

export class TableFeed extends Plugin<Table>
{

	observer: IntersectionObserver | undefined = undefined

	async feed()
	{
		const table = this.of.element
		const tbody = table.querySelector(':scope > tbody')
		const url   = table.dataset.feed ?? table.closest<HTMLFormElement>('form[action]')?.action
		if (!tbody || !url) return

		const offset      = tbody.querySelectorAll(':scope > tr').length
		const params      = this.params(offset)
		const offsetUrl   = url + (url.includes('?') ? '&' : '?') + params.toString()
		const visibleRows = Math.ceil(tbody.clientHeight / offset)
		const requestInit = { headers: { 'xhr-info': JSON.stringify({ visibleRows }) } }

		const loaded      = document.createElement('div')
		loaded.innerHTML  = await (await fetch(offsetUrl, requestInit)).text()
		const container   = loaded.querySelector('tbody > tr')?.parentElement ?? loaded.querySelector('tr')?.parentElement
		if (!container) return

		while (container.firstChild) {
			tbody.append(container.firstChild)
		}
		this.observe()
	}

	fieldSelector(fields: string)
	{
		return fields.split(/\s+/).filter(Boolean).map(field => {
			const start    = field.startsWith('*')
			const end      = field.endsWith('*')
			const operator = start ? (end ? '*=' : '$=') : (end ? '^=' : '=')
			const name     = field.slice(start ? 1 : 0, end ? -1 : undefined)
			return `:is(input, select, textarea)[name${operator}"${CSS.escape(name)}"]`
		}).join(', ')
	}

	init()
	{
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

	params(offset: number)
	{
		const params   = new URLSearchParams({ offset: offset.toString() })
		const table    = this.of.element
		const selector = this.fieldSelector(table.dataset.feedFields ?? '')
		if (!selector) return params

		const fields = table.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector)
		for (const field of fields) {
			params.append(field.name, field.value)
		}
		return params
	}

}
