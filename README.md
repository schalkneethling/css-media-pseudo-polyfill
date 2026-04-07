# css-media-pseudo-polyfill

A CSS polyfill for the [media pseudo-classes](https://html.spec.whatwg.org/multipage/semantics-other.html#selector-muted): `:playing`, `:paused`, `:seeking`, `:buffering`, `:stalled`, and `:muted`.

These pseudo-classes allow styling based on the playback, loading, and sound state of `<audio>` and `<video>` elements. Browser support is still incomplete — this polyfill detects which pseudo-classes the browser does not support and provides equivalent behavior via class selectors.

## How it works

The polyfill runs in four stages:

1. **Feature detection** — Each of the 7 media pseudo-classes is tested individually via `CSS.supports('selector(:name)')`. Only unsupported pseudo-classes are polyfilled. This allows partial support (e.g., Safari may support `:playing` but not `:buffering`).

2. **CSS rewriting** — Inline `<style>` elements are parsed with [css-tree](https://github.com/nicolo-ribaudo/css-tree). For each rule containing a target pseudo-class, a class-based equivalent is injected as a sibling rule immediately after the original in the AST (e.g., `video:playing { ... }` is followed by `video.media-pseudo-polyfill-playing { ... }`). The browser skips the rule it doesn't understand and applies the class-based fallback — a natural progressive enhancement pair.

3. **`<link>` stylesheet rewriting** — Same-origin `<link rel="stylesheet">` elements are fetched via the Fetch API and rewritten using the same text-based approach as inline `<style>` elements. The rewritten CSS is injected as a sibling `<style>` element and the original `<link>` is disabled. This avoids the CSSOM approach where browsers silently drop rules containing unrecognised pseudo-class selectors before the polyfill can process them. Cross-origin stylesheets are detected via origin comparison and skipped.

4. **Element observation** — Media elements are discovered via `querySelectorAll` and a `MutationObserver`. Event listeners are attached to each element to track state changes. On every relevant event, the element's state is recomputed and the corresponding polyfill classes are toggled.

## Entry points

| Export          | Description                                             |
| --------------- | ------------------------------------------------------- |
| `"."` (default) | Auto-applies the polyfill on `DOMContentLoaded`         |
| `"./fn"`        | Exports the `polyfill()` function for manual invocation |

The `"./fn"` entry point is useful when you need to run the polyfill earlier (e.g., from a synchronous `<script>` in `<head>`) to minimize the flash of unstyled content (FOUC).

**Default entry point** — auto-applies on `DOMContentLoaded`:

```js
import "@schalkneethling/css-media-pseudo-polyfill";
```

**`"./fn"` entry point** — call `polyfill()` manually, e.g. from a synchronous `<script>` in `<head>` to minimize FOUC:

```html
<script type="module">
  import { polyfill } from "@schalkneethling/css-media-pseudo-polyfill/fn";
  polyfill();
</script>
```

Or from a module bundler:

```js
import { polyfill } from "@schalkneethling/css-media-pseudo-polyfill/fn";
polyfill();
```

## Spec references

The pseudo-class definitions and their DOM conditions come from the [WHATWG HTML spec](https://html.spec.whatwg.org/multipage/semantics-other.html#selector-muted):

| Pseudo-class     | DOM condition                                                                    |
| ---------------- | -------------------------------------------------------------------------------- |
| `:playing`       | `paused === false`                                                               |
| `:paused`        | `paused === true`                                                                |
| `:seeking`       | `seeking === true`                                                               |
| `:buffering`     | `!paused && networkState === NETWORK_LOADING && readyState <= HAVE_CURRENT_DATA` |
| `:stalled`       | matches `:buffering` AND the internal "is currently stalled" flag is `true`      |
| `:muted`         | `muted === true`                                                                 |
| `:volume-locked` | Not polyfillable (no DOM surface)                                                |

The `NETWORK_LOADING`, `HAVE_CURRENT_DATA`, and other constants are defined on the [HTMLMediaElement interface](https://html.spec.whatwg.org/multipage/media.html#htmlmediaelement) as `const unsigned short` values. They are available as both static and instance properties.

## Design decisions

### Per-pseudo-class detection

Rather than a single feature check, each pseudo-class is tested individually. Safari has partial support — it may implement some pseudo-classes but not others. Per-pseudo-class detection allows the polyfill to skip already-supported pseudo-classes and only rewrite and manage the unsupported ones. If `CSS.supports` is unavailable or throws, the pseudo-class is treated as unsupported.

### Immediate-sibling injection for cascade preservation

For each rule containing a target pseudo-class, the polyfill inserts a class-based equivalent as a sibling rule immediately after the original in the AST. The original stylesheet is left untouched. This produces pairs like:

```css
video:playing {
  outline: 0.25rem solid green;
}
video.media-pseudo-polyfill-playing {
  outline: 0.25rem solid green;
}
```

Two alternative approaches were considered and rejected:

- **Clone-and-disable** (clone the entire AST, disable the original stylesheet): unnecessarily complex. Because the polyfill class is only present when the state is active, the injected rule is inert when the state doesn't apply — it cannot interfere with other rules regardless of source order. This is fundamentally different from attribute-based polyfills (e.g., container queries) where rewritten selectors match unconditionally.

- **Extract-and-append** (extract only rewritten rules, append to end): incorrect. Moving rules out of their `@layer`, `@media`, or `@supports` context would break the author's cascade intent.

Immediate-sibling injection keeps each rewritten rule inside the same block as its original, preserving `@layer`, `@media`, and `@supports` nesting with no special logic.

### Specificity-neutral substitution

The polyfill replaces `PseudoClassSelector` nodes (specificity 0,1,0) with `ClassSelector` nodes (also 0,1,0). This substitution is specificity-neutral in all contexts — including inside `:is()` (which uses the most specific argument's specificity), `:where()` (which zeroes everything), and `:has()` (which contributes the argument's specificity). No `:where()` wrapping is needed.

### `:volume-locked` handling

`:volume-locked` cannot be polyfilled because the "volume locked" flag is a user-agent-level boolean with no DOM surface. The polyfill handles it as follows to prevent broken stylesheets:

- **Lone selector** (`video:volume-locked { ... }`): the entire rule is removed
- **In a selector list** (`video:playing, video:volume-locked { ... }`): the `:volume-locked` branch is pruned; the `:playing` branch is rewritten normally
- **Inside `:is()` / `:where()`**: the `:volume-locked` argument is removed from the list
- **Inside `:not()`**: rewritten to `.media-pseudo-polyfill-volume-locked` (matches everything, since the class is never set — consistent behavior)

### Pure state computation with externally managed stalled flag

The `computeStates()` function is pure — it reads properties from an `HTMLMediaElement` and returns a `Set<string>` of active states. The "is currently stalled" flag is passed in as a parameter rather than being computed internally because this flag is not directly observable from DOM properties. It must be tracked via the formal state machine defined in the [HTML spec](https://html.spec.whatwg.org/multipage/media.html#concept-media-load-resource):

- Set to `true` when the `stalled` event fires (browser's ~3 second stall timeout expired)
- Reset to `false` when `progress`, `emptied`, or `loadstart` fires

This separation keeps `computeStates()` easily testable with plain objects.

### WeakMap for per-element state

Per-element state (event handler reference and stalled flag) is stored in a `WeakMap<HTMLMediaElement, ElementState>`. The `MutationObserver` callback explicitly cleans up when elements are removed from the DOM. The `WeakMap` acts as a safety net — if cleanup is missed (e.g., observer disconnected, edge case in DOM reparenting), the garbage collector can still reclaim the element and its associated state. A regular `Map` would hold a strong reference to the element key, preventing collection. On pages with many dynamic video elements (e.g., YouTube feed with preview hovers), this prevents memory leaks.

### Single event handler per element

Media events do not bubble, so each element requires direct `addEventListener` calls. Rather than creating 14 separate handler functions per element, a single handler is created and registered for all 14 event types. The handler uses `event.type` in a switch statement to handle special cases (stalled flag transitions) before recomputing state. This means 14 registrations per element (unavoidable) but only 1 function object allocated per element — on a page with 20 videos, that is 20 function objects instead of 280.

### Bind-once guard

Before attaching listeners, the polyfill checks whether the element is already tracked in the `WeakMap`. This prevents duplicate bindings from rapid DOM reparenting, where the `MutationObserver` may report the same element in both `removedNodes` and `addedNodes` in a single batch.

### Fetch-based rewriting for `<link>` stylesheets

Same-origin `<link rel="stylesheet">` elements are rewritten by fetching the CSS text and running it through the same `rewriteCss()` function used for inline `<style>` elements. The rewritten output is injected as a `<style>` element immediately after the original `<link>`, which is then disabled.

An earlier approach used the CSSOM API (`sheet.cssRules` + `insertRule()`), which avoids an extra network request. However, this has a fundamental flaw: browsers silently drop rules containing unrecognised pseudo-class selectors during CSS parsing. By the time the polyfill walks the CSSOM, the rules it needs to rewrite have already been discarded. The fetch-based approach accesses the raw CSS text before browser parsing, ensuring all rules are available for rewriting.

Cross-origin stylesheets are detected via `new URL(href).origin` comparison against `window.location.origin` and skipped. This covers both relative paths (resolved to absolute by the browser) and explicit absolute URLs to external CDNs.

## Known limitations

- **`:volume-locked` is not polyfillable.** The "volume locked" flag has no DOM surface. The polyfill removes `:volume-locked` selectors from rewritten stylesheets and never sets the corresponding class.

- **Class selectors can match non-media elements.** Native `:playing` only matches `<audio>` and `<video>` elements. The polyfilled `.media-pseudo-polyfill-playing` class has no such restriction. In practice this is not an issue because the polyfill only ever toggles these classes on media elements. An author would need to manually add the class to a non-media element to trigger a false positive.

- **FOUC window.** Stylesheet rewriting runs when the polyfill is invoked (at `DOMContentLoaded` for the default entry point). There is a window between first paint and polyfill initialization where pseudo-class-based styles are not applied. Use the `"./fn"` entry point from a synchronous `<script>` in `<head>` to minimize this gap.

- **Cross-origin `<link>` stylesheets are not rewritten.** The polyfill only fetches and rewrites same-origin stylesheets. Cross-origin sheets served from external CDNs are skipped.
