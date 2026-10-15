# Column reordering — specifications

## Purpose and status

This document defines the expected behavior of `TableColumnReorder`, then separately describes the implementation
available today. The words “must” and “must not” define the functional contract; the “Implementation status” section
reports what the current code actually does.

The plugin reorders the table DOM. It does not modify an application data model or framework configuration, and it
does not persist the selected order.

## Functional specifications

### Drag initiation

- The direct cells of the first `thead` row form the drag handle area. If there is no `thead` row, the first row of the
  first `tbody` serves this purpose. A table with neither row remains inactive.
- Only the primary pointer and its primary button must be able to arm a drag.
- A link, button, form control, editable content, or `draggable` element inside the header must retain its own behavior
  and must not initiate column reordering.
- Dragging starts after horizontal movement greater than or equal to `threshold`, which defaults to 10 CSS pixels.
  Vertical movement alone must not start it.
- Releasing before this threshold must remain a normal click. Once the threshold is crossed, the click following the
  gesture must be suppressed so that it does not, for example, trigger sorting.

### Live reordering

- The source column remains a real column: no clone, placeholder, or floating element follows the pointer.
- When the pointer crosses 10 pixels beyond the physical boundary of a neighboring column, the source is inserted at
  that position. A fast movement may cross several columns in one operation.
- Reordering is horizontal and continues while the pointer is above, below, or outside the table. Its actual direction
  must be taken into account to prevent oscillation caused by width changes after insertion.
- All cells in the column are moved together across the `thead`, every `tbody`, and the `tfoot`. If the table has a
  simple `colgroup`, the corresponding `<col>` moves with them.
- DOM nodes are moved rather than recreated: their identity, listeners, and values are preserved. The relative order
  of every other column remains unchanged.
- DOM reads performed during the gesture see the real intermediate order. Releasing the pointer requires no additional
  visual mutation.

### Horizontal scrolling

- The nearest horizontally scrollable container is determined when the drag starts.
- Within a 50-pixel area along either edge, continuous automatic scrolling brings off-screen columns into view. Its
  speed increases toward the edge, up to 800 CSS pixels per second.
- Destination calculation must use the current geometry after every scroll, resize, or column move.
- Scrolling stops as soon as the pointer leaves the edge area, the container reaches its limit, or the gesture ends.

### Commit and cancellation

- `pointerup` commits the visible order, including when released outside the table.
- Escape, `pointercancel`, unexpected pointer-capture loss, or a reset cancel the gesture and restore the column to its
  initial index.
- Every exit path must release pointer capture, stop animation and scrolling, and remove all visual states.
- Only one column reorder may be active at a time within a document.
- `onReorder(header)` is called exactly once after a commit that actually changes the index. The supplied header is
  already at its final position. The callback is not called after returning to the initial index or after cancellation.

### Visual states

- During reordering, `.column-reorder` is applied to every cell in the source column and to the `html` element. The
  cell classes are application styling hooks; they must not be used to identify the source internally.
- A horizontal cursor must remain visible throughout the document during the gesture, regardless of the element under
  the pointer.
- All these states must be removed through every exit path, including after a system interruption.

### Protected columns and Freeze integration

The following option controls which columns may be reordered:

```ts
isReorderable?: (header: HTMLTableCellElement) => boolean
```

It is evaluated for the drag-handle row cells at the start of each gesture. A rejected column can neither be the
source nor be crossed: it splits the table into independent contiguous segments.

`TableColumnReorder` does not depend on any other plugin. `TableColumnReorderFreeze` supplies an `isReorderable`
implementation that protects columns frozen on the left and right, but only if the application has not already
provided its own callback. It has no effect when either Freeze or Reorder is not installed.

### Compatible table structure

Guaranteed behavior targets a simple horizontal grid:

| Case | Expected compatibility |
| --- | --- |
| No `thead` row and at least one non-empty `tbody` | Yes; the first row of the first `tbody` is the drag handle area |
| Multiple `thead` rows, multiple `tbody` elements, or a `tfoot` | Yes, if all rows share the same grid |
| No `colgroup` | Yes |
| One `colgroup` with exactly one `<col span="1">` per column | Yes |
| Mixed `th` and `td` cells | Yes |
| Empty table | Inactive, without errors |

Before arming an actual drag, the plugin must verify that every row has the same number of cells, every cell has
`colspan="1"` and `rowspan="1"`, and any `colgroup` follows the structure above. An incompatible table must remain
unchanged and must not cause an error.

### API

```ts
class TableColumnReorderOptions extends PluginOptions {
	isReorderable?: (header: HTMLTableCellElement) => boolean
	onReorder?:     (header: HTMLTableCellElement) => void
	threshold       = 10
}
```

`threshold` is expressed in CSS pixels and must be a finite, non-negative number. Persisting the order, updating a
model, or sending it to a server is the responsibility of `onReorder`.

## Implementation status

The current code already provides the primary user flow:

- delegated event handling on the drag-handle row and consistent use of `PointerEvent` for mouse, pen and touch;
- `touch-action: none` and text-selection prevention on drag-handle cells, installed before each gesture starts;
  both axes are reserved to allow vertical column removal. Native scrolling remains available outside that row;
- a configurable horizontal threshold, pointer capture, and computation batching with `requestAnimationFrame`;
- direct, live insertion of the cell at the same index in every row returned by `table.rows`;
- movement of the corresponding `<col>` when one is found;
- a 10-pixel penetration threshold, direction tracking, and rectangle recalculation on every relevant frame;
- automatic scrolling of the first horizontally scrollable ancestor, using the specified areas and speed;
- commit on `pointerup`, restoration on Escape, `pointercancel`, loss of table pointer capture, and reset;
- suppression of the click following a drag, including delayed touch clicks, while preserving the next tap;
- `.column-reorder` classes, the `onReorder` callback, `isReorderable` barriers, and Freeze integration.

Regression tests in `test/column-reorder.test.mjs` cover reordering, removal, scrolling, cancellation, pointer types
and click suppression. Chromium touch emulation also checks taps, dragging, vertical removal, body scrolling and the
first-`tbody` fallback. Physical mobile devices and other browser engines have not been verified.

## Known limitations and unsupported configurations

### Table structures

- **Merged cells**: `rowspan` and `colspan` are not mapped. The code moves a DOM index, which may not match a visual
  column in such tables.
- **Irregular grids**: cell counts are not validated. A short row may cause an exception at startup or during movement
  and leave the table partially reordered.
- **Complex `colgroup` structures**: multiple `colgroup` elements, a `<col>` count different from the cell count, or a
  `span` greater than 1 may desynchronize styles, move the wrong `<col>`, or cause an exception.
- **Hidden or zero-width columns**: their rectangles cannot provide a reliable crossing threshold.
- **Concurrent mutation**: adding, removing, or replacing a row, cell, drag-handle row, or `<col>` during the gesture is
  not detected. Cancellation may then move the wrong nodes or fail.
- **Framework-managed DOM or virtualized tables**: only the rendered DOM is reordered. A subsequent render may discard
  the choice until the application synchronizes its model through `onReorder`.

### Direction, input, and accessibility

- **RTL and vertical writing modes**: the algorithm associates increasing `clientX` with increasing DOM indexes and
  uses `scrollLeft` directly. It is therefore limited to horizontal LTR tables.
- **Interactive controls**: contrary to the specification, the current code does not exclude links, buttons, fields,
  editable content, or `draggable` elements from the drag handle area. Horizontal movement starting from one of them
  may reorder the column and suppress its click.
- **Multi-touch**: only the primary pointer can arm a drag. Other pointer IDs cannot move or finish it; gestures using
  several fingers to manipulate columns are not provided.
- **Touch scrolling**: native panning and zooming are disabled on the drag-handle row so horizontal reordering and
  vertical removal remain available. Start native scrolling or zooming outside that row.
- **Keyboard and assistive technologies**: no keyboard reordering mechanism, ARIA attribute, or new-position
  announcement is provided. Escape only cancels a pointer gesture.

### Lifecycle, presentation, and performance

- **Window loss**: window blur and removal of the table from the document are not observed directly. Without
  `pointerup`, `pointercancel` or loss of table pointer capture, classes and global state may remain active.
- **Capture failure**: exceptions from `setPointerCapture()` are not caught.
- **Global cursor**: the class is added to `html`, but the current plugin provides no cursor rule; the application must
  still define the desired rendering.
- **Nested scrolling and viewport**: only the first scrollable container detected at startup is controlled. The plugin
  does not move to an ancestor when that container reaches its limit and does not guarantee page auto-scrolling.
- **Heterogeneous widths and position-based styles**: with `table-layout: auto`, moving content may abruptly change
  widths. `:nth-child()` styles remain attached to positions; business-specific styling must be carried by the cells or
  by a compatible `<col>`.
- **Very large tables**: each index change moves one node per row, giving linear cost. No table-size threshold or
  responsiveness level is currently guaranteed.
- **Invalid options**: negative, non-finite, or `NaN` values for `threshold` are not normalized.

These cases must be rejected safely, documented as preconditions, or addressed by a future change before they are
advertised as compatible.
