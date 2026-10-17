[![npm version](https://img.shields.io/npm/v/@itrocks/table?logo=npm)](https://www.npmjs.org/package/@itrocks/table)
[![npm downloads](https://img.shields.io/npm/dm/@itrocks/table)](https://www.npmjs.org/package/@itrocks/table)
[![GitHub](https://img.shields.io/github/last-commit/itrocks-ts/table?color=2dba4e&label=commit&logo=github)](https://github.com/itrocks-ts/table)
[![issues](https://img.shields.io/github/issues/itrocks-ts/table)](https://github.com/itrocks-ts/table/issues)
[![discord](https://img.shields.io/discord/1314141024020467782?color=7289da&label=discord&logo=discord&logoColor=white)](https://25.re/ditr)

# table

A lightweight, modular HTML table offering near-spreadsheet features such as edit, freeze, lock, scroll, and more.

*This documentation was written by an artificial intelligence and may contain errors or approximations.
It has not yet been fully reviewed by a human. If anything seems unclear or incomplete,
please feel free to contact the author of this package.*

## Installation

```bash
npm i @itrocks/table
```

## Usage

`@itrocks/table` is a lightweight, modular JavaScript table component that
turns a plain HTML `<table>` into a near‑spreadsheet widget: editable
cells, frozen columns, locked headers, horizontal and vertical scrolling,
and more.

At runtime you create `Table` instances from existing DOM elements.

### Minimal example

```ts
import { tableBySelector } from '@itrocks/table'

// Turn all matching <table> elements into interactive tables
const tables = tableBySelector('.js-data-table')

// Optionally keep a reference to one table
const table = tables[0]
```

Make sure the DOM is ready before you call `tableBySelector` (for example
after `DOMContentLoaded` or in your framework's mounted hook).

You can also construct a table directly from an element:

```ts
import { tableByElement } from '@itrocks/table'

const element = document.querySelector('table#users') as HTMLTableElement
const table   = tableByElement(element)
```

For more advanced usage (plugins, styling, demos), check out the
[GitHub demo folder](https://github.com/itrocks-ts/table/tree/master/demo).

## API

The public API is intentionally small and focuses on a single `Table`
class plus a few helpers.

### `applyStyleSheets()`

```ts
import { applyStyleSheets } from '@itrocks/table'

applyStyleSheets()
```

Forces the table module to (re)apply its internal style sheets. In most
applications you do not need to call this manually: it is handled when
creating `Table` instances. It can be useful in advanced integration
scenarios (dynamic theme switch, hot‑reloaded styles, etc.).

### `garbageCollector()`

```ts
import { garbageCollector } from '@itrocks/table'

garbageCollector()
```

Runs an internal cleanup pass to detach listeners and release resources
from tables that are no longer present in the DOM. You might call this
periodically in long‑running pages where tables are created and removed
dynamically.

### `getTables()`

```ts
import { getTables } from '@itrocks/table'

const tables = getTables()
```

Returns the list of all `Table` instances currently managed by the
module. This is mainly useful for debugging or global operations (for
example applying a plugin to every existing table).

### `type Options = PluginOptions<Table>`

Configuration object passed when creating a `Table`. It is based on the
generic plugin system from
[`@itrocks/plugin`](https://github.com/itrocks-ts/plugin).

Typical usage:

```ts
import type { Options } from '@itrocks/table'

const options: Partial<Options> = {
	// enable / configure plugins here
}
```

The exact shape of the options depends on the plugins you enable (edit,
freeze, reorder, etc.). Refer to each plugin's documentation and the
demo code for details.

### `class Table extends HasPlugins<Table>`

Represents an interactive table instance bound to a single
`HTMLTableElement`.

#### Constructor

```ts
import { Table } from '@itrocks/table'

const table = new Table(element, options)
```

Parameters:

- `element: HTMLTableElement` – the DOM table to enhance.
- `options?: Partial<Options>` – optional configuration and plugins.

#### Properties

- `element: HTMLTableElement` – underlying table element.
- `id: number` – numeric identifier assigned to the table instance.
- `selector: string` – selector used when the table was created (when
  relevant).
- `onReset: (() => void)[]` – list of callbacks invoked when the table
  is reset.
- `styleSheet: string[]` – list of CSS rules associated with this table
  instance.

#### Methods

##### `addEventListener(element, type, listener, options?)`

Delegates the registration of an event listener through the table
infrastructure, so it can be properly cleaned up on reset or removal.

```ts
table.addEventListener(document, 'keydown', event => {
	// react to keyboard shortcuts related to this table
})
```

##### `cellColumnNumber(cell: HTMLTableCellElement): number`

Returns the zero‑based column index of the given table cell within its
row. This is handy when writing plugins that need to know which column a
cell belongs to.

##### `reset(): Table`

Resets the table to its initial state:

- clears plugin state,
- reapplies default configuration,
- triggers all callbacks registered in `onReset`.

```ts
table.reset()
```

### Helper constructors

In addition to the `Table` class, the module exposes convenience
functions to create tables from different inputs.

#### `tableByElement(element, options?)`

```ts
import { tableByElement } from '@itrocks/table'

const table = tableByElement(element, { /* options */ })
```

Creates (or returns an existing) `Table` instance for the given
`HTMLTableElement`.

#### `tableByElements(elements, options?)`

```ts
import { tableByElements } from '@itrocks/table'

const nodeList = document.querySelectorAll('table.data')
const tables   = tableByElements(nodeList)
```

Accepts an array or a `NodeListOf<HTMLTableElement>` and returns an
array of `Table` instances.

#### `tableBySelector(selector, options?)`

```ts
import { tableBySelector } from '@itrocks/table'

const tables = tableBySelector('.js-data-table')
```

Finds all tables matching the CSS selector and returns the corresponding
`Table` instances.

## Typical use cases

- Enhance existing HTML tables with spreadsheet‑like behaviours (edit,
  freeze, lock, scroll) without rewriting the markup.
- Build rich back‑office or data‑entry screens where users can edit
  multiple rows directly in a table.
- Implement custom plugins on top of `HasPlugins<Table>` to add domain‑
  specific features (validation, inline actions, totals rows, etc.).

## Adding columns

Import the public browser entry and stylesheet. Configure `TableColumnAdd` after `TableColumnReorder` and any
freeze plugins. The addition plugin consumes opaque string ids and callback-rendered cells; it has no dependency on
business objects, selectors, routes or storage.

```ts
import { TableColumnAdd }     from '@itrocks/table/column-add.js'
import { TableColumnReorder } from '@itrocks/table/column-reorder.js'
import { Table }              from '@itrocks/table/table.js'

const addition = new TableColumnAdd({
	onChange: change => console.log(change.id, change.state)
})
const table = new Table(document.querySelector('table')!, {
	plugins: [TableColumnReorder, addition]
})
const result = await addition.add({
	id: 'opaque-column-id',
	create: () => ({
		header: Object.assign(document.createElement('th'), { textContent: 'Metric' }),
		cells: Array.from(table.element.tBodies[0].rows, () => document.createElement('td'))
	})
})
```

Include `<link rel="stylesheet" href="/node_modules/@itrocks/table/column-add.css">` in the consuming document,
adapting its public URL to your asset host. See [the standalone fixture](demo/column-add.html) for asynchronous values,
retry, reset, sorting and frozen columns. The fixture is development material and is excluded from the package tarball.

`ColumnSource.create(): ColumnContent` supplies one detached header and one detached cell for every other table row,
in DOM order, including footer rows. Addition supports rectangular tables with exactly one header row and no spans.
Invalid creation rejects before insertion. A `colgroup`, when present, must have one `col` per column.
`ColumnSource.load?(signal): Promise<ColumnContent>` optionally supplies replacement header/cells asynchronously.
Callbacks own safe rendering, row identity and data access. If row elements change while loading, the plugin reports an
error rather than applying stale positional values. Before retry, the consumer updates its callbacks' row data to
match the current view.

- `add(source): Promise<'added' | 'existing'>` appends before right-frozen columns, reveals and highlights. It resolves
  once the real placeholder column is committed, independently of optional values. A repeated id reveals/highlights its
  existing position, without invoking its creation/loading callbacks or issuing another commit.
- `reveal(id): void` scrolls the horizontal container only as needed, accounting for frozen bounds.
- `highlight(id): void` applies the same green/light/theme flash for new and existing columns, cleans up after 900 ms,
  honours reduced motion and preserves keyboard focus and row selection.
- `remove(id, signal?): Promise<boolean>` reveals a column, flashes its cells red with an immediate 150 ms fade,
  then removes the header, body/footer cells and matching `col`. It returns false for a missing column or cancellation. Repeated calls share the
  pending removal; abort, disposal and reset clear the flash without deletion. Late values cannot restore a removed
  column. Reduced motion uses a static red outline. The host persists the resulting configuration.
- `retry(id): Promise<void>` retries a failed value callback. Failure retains the committed column and marks it with
  `.column-add-error`; the consumer presents the error and a retry control. It never confirms another addition.
- `begin(source): ColumnTransaction` creates a real provisional column without committing it. Its `ready` promise waits
  for optional values and resolves after error notification as well. `moveTo(index)` reuses public reorder placement
  and its existing boundaries. `commit()` validates it and returns `added` or `existing`; repeating commit returns
  `existing`. `cancel()` aborts values, removes new provisional cells or restores an existing column's position.
  Completed/cancelled handles cannot move a column. `begin()` itself installs no pointer transport.
- `dispose(): void` cancels provisional operations, aborts outstanding values and removes flash resources. Committed
  columns remain. `Table.reset()` invokes disposal automatically; call disposal when removing the owning view.

`TableColumnAddOptions.identify(header)` defaults to `header.dataset.columnId`. Added and loaded headers carry this
opaque attribute so identity survives plugin resets. A custom callback can identify pre-existing columns differently.
`onChange(change)` runs synchronously for `provisional`, `committed`, `loaded`, `error` and `cancelled` observations;
`change` contains `id`, `header`, `state` and an optional `error`. Consumers persist only `committed` changes and must
not throw from this observer. Loading uses `.column-add-loading` and `aria-busy`, independently of provisional state.
An aborted or removed operation cannot be recreated by late values.

`TableColumnReorder.moveColumn(header, index)` is public placement without header gesture callbacks. It rejects an
active header interaction and clamps movement to that header's reorderable boundaries.
`TableColumnReorder.removeColumn(header): boolean` removes a reorderable column and its `col` without header callbacks.
It rejects an active header interaction and returns false for a missing or fixed column.
`TableColumnReorder.replaceCell(previous, replacement)`
preserves an active header gesture during asynchronous cell replacement. `TableFreeze.refresh()` recalculates sticky
offsets after structural changes. `Table.refreshStyleSheets()` reapplies the managed styles.

`TableColumnReorder.scrollContainer()` exposes the existing horizontal scroll owner for table plugins.
`TableFreeze.visibleInnerRect()` returns the area between rendered sticky cells, including tables configured through
`colgroup`. `reveal()` fully exposes columns that fit that area and uses its maximum width for wider columns, with
minimal scrolling in either direction. Freeze refresh measures natural cell positions before recalculating offsets,
including header-backed tables after addition, asynchronous replacement or reset.

### External pointer transport

`beginExternal(source, sample): ColumnOperation` immediately creates a hidden provisional column and starts loading
its values. The cells and optional `col` stay hidden until the pointer first enters the visible table; loaded replacements
preserve that visibility. On entry, the column appears with any values already received and starts following reorder
geometry. Reusing an existing id keeps its column visible throughout the gesture.
The structural `PointerSample` contains `pointerId`, `pointerType`, `clientX` and `clientY`. The source owns capture.
`move(sample)` uses the existing reorder engine, including frozen boundaries and visible-edge autoscroll.
`finish(sample)` resolves to `added`, `moved` or `cancelled`; an outside drop cancels without a fallback insertion.
`cancel()` restores an existing column's original position or removes a new preview. Neither operation invokes the
header-origin removal callback. Disposal and reset invalidate the handle and discard late loaded content.

Optional `ColumnSource.accept(signal)` validates host admission independently of values. It starts once alongside
`load`; a valid drop waits for admission, with geometry held and other column gestures excluded, then commits without
waiting for `load`. Rejection rolls back and rejects `finish`. An omitted callback accepts immediately. Value errors
remain retryable and do not reject a valid drop. The host must keep admission independent of its data request.

`TableColumnReorder.beginExternal(header, sample): ExternalColumnOperation` is the lower-level public extension for
an already attached column. Its `move`, `hold`, `finish` and `cancel` methods share header-origin geometry and
placement.
`hold(sample)` settles and pauses autoscroll while retaining exclusivity; it returns whether the target is valid.
`finish(sample)` releases the gesture and returns acceptance. It never calls header reorder/removal notifications;
the owning addition transaction emits its distinct commit notification. Header-origin gestures retain their callbacks.
