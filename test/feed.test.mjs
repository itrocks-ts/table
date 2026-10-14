import assert        from 'node:assert/strict'
import { test }      from 'node:test'
import { TableFeed } from '../feed.js'

test('feed sends declared fields with exact, prefix and suffix selectors', async () => {
	const originalCSS      = globalThis.CSS
	const originalDocument = globalThis.document
	const originalFetch    = globalThis.fetch
	const calls            = []
	const inputs           = [
		{ name: 'criteria.name', value: 'Alice & Bob + Émile' },
		{ name: 'criteria.owner', value: '' },
		{ name: 'tenant', value: '42' },
		{ name: 'owner.id', value: '12' }
	]
	const tbody = { clientHeight: 300, querySelectorAll: () => Array(10) }
	const table = {
		closest: () => ({ action: 'https://example.test/entries/list' }),
		dataset: {
			feed: 'https://example.test/entries/list?scope=active',
			feedFields: ' criteria.* tenant *.id '
		},
		querySelector: () => tbody,
		querySelectorAll: selector => {
			assert.equal(selector,
				':is(input, select, textarea)[name^="criteria."], '
				+ ':is(input, select, textarea)[name="tenant"], '
				+ ':is(input, select, textarea)[name$=".id"]'
			)
			return inputs
		}
	}

	globalThis.CSS = { escape: value => value }
	globalThis.document = { createElement: () => ({ querySelector: () => null }) }
	globalThis.fetch = async (url, init) => {
		calls.push({ init, url: new URL(url) })
		return { text: async () => '' }
	}
	try {
		const feed = new TableFeed()
		feed.of = { element: table }
		await feed.feed()
		delete table.dataset.feed
		await feed.feed()

		assert.equal(calls[0].url.searchParams.get('scope'), 'active')
		for (const { init, url } of calls) {
			assert.equal(url.searchParams.get('offset'), '10')
			assert.equal(url.searchParams.get('criteria.name'), 'Alice & Bob + Émile')
			assert.equal(url.searchParams.get('criteria.owner'), '')
			assert.equal(url.searchParams.has('criteria.owner'), true)
			assert.equal(url.searchParams.get('tenant'), '42')
			assert.equal(url.searchParams.get('owner.id'), '12')
			assert.deepEqual(JSON.parse(init.headers['xhr-info']), { visibleRows: 30 })
		}

		delete table.dataset.feedFields
		table.querySelectorAll = () => assert.fail('No fields should be selected without feedFields')
		await feed.feed()
		assert.equal(calls[2].url.search, '?offset=10')
	}
	finally {
		globalThis.CSS      = originalCSS
		globalThis.document = originalDocument
		globalThis.fetch    = originalFetch
	}
})
