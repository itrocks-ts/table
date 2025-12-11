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
