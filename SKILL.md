---
name: 4i7-design
description: Find, add, preview, tune, and apply effects from the 4i7 Design catalog to websites. Use for this library by name or free description; not for unrelated design tasks.
---

# 4i7 Design

This skill lives at the root of the library. Resolve paths relative to this `SKILL.md`, regardless of the current project directory. The catalog is publicly visible but `UNLICENSED`; public visibility does not grant reuse rights.

## Find

Run `node "<library-root>/scripts/find-effect.mjs" --query "<owner's words>" --limit 3`. It reads only `catalog/index.jsonl` and returns ranked metadata. Search with the owner's name or free description. Report only returned matches, including version and `draft`/`ready` status; do not invent an effect when there is no match. Read the selected effect's `effect.json`, `README.md`, and `controls.schema.json` only after selection. When adding or changing an effect, run `node "<library-root>/scripts/build-index.mjs"`, then `node "<library-root>/scripts/build-index.mjs" --check`.

## Browse visually

If the owner asks to see the library or all effects (for example, `$4i7-design открой библиотеку`), run `npm run library:start` from the library root. Use the actual localhost URL printed by the command and open `/` in a visible browser tab. The command reuses its own running server. Do not start another `npm run dev` process. Keep the server available while the owner explores; on an explicit close request run `npm run library:stop`. It stops itself after 60 minutes without HTTP requests; restart it on the next browse request. This homepage lists catalog entries as cards; each card opens its live demo. If the owner refers to a card by its displayed number, resolve that number against the current order in `catalog/index.jsonl` and state the matched title and ID before applying it. State that the local URL works only while the server runs. The catalog and effect sources persist in this local Git clone; committed and pushed versions also persist in its GitHub remote. The browser page is a view of them, not their storage.

## Preview and tune

From the library root run `npm run library:start` and take the actual localhost URL from its output; port 5173 may be occupied. Append the selected `demo` route from the index and try to open it in a separate visible window or tab through an available browser tool. If an external window is unavailable, open a visible Codex in-app browser panel and give the owner the local URL; do not bypass a rejected environment policy. For example, the magnetic effect route is `/?effect=magnetic-cards`. A card on the catalog homepage can also open that route. Do not change a target site merely to preview an effect.

Let the owner tune controls in the local preview. The preview saves a preset through `POST /api/presets`, returning a path under `.local/sessions/<id>.json` with effect ID, effect version, and complete options. Use that returned file for transfer; validate the options against the chosen `controls.schema.json`. If the owner says “apply the saved variant” without a path, inspect `.local/sessions/*.json` for the selected effect and version, select the latest by file modification time, and state its time, version, and options. Ask the owner to choose if several files remain plausible; if none exists, ask them to save or identify a preset. Never use unsaved panel state for transfer. Keep session presets local and out of Git. A preview of a `draft` is for evaluation, not proof that its visuals are final.

## Apply to a site

When the owner asks to apply the selected effect, inspect the destination's framework, semantics, existing transforms, motion conventions, and tests. Adapt the effect's DOM/TypeScript behavior and scoped styles through a small project-specific integration. Preserve the original interaction, visible focus, keyboard and touch behavior, reduced motion, and cleanup on unmount. Run the destination's relevant build and interaction checks, including desktop pointer, mobile, keyboard, and reduced motion. Explain any mismatch that could not be resolved.

Record the exact effect ID, version, library commit, preset options, and local adaptations in the destination's `design-effects.lock.json`. Do not silently replace an existing integration when a newer library version appears. Review the change and retest it before an update.

## Add an effect

When the owner asks to grow the library, create one `effects/<id>/` entry with metadata, a concise effect card, a bounded options schema, portable implementation, local demo, and behavior checks. Wire the new `demo` route into the playground and verify the catalog card opens that demo and can return to `/`; run the data-driven browser test for every indexed demo. Use the existing entry as a structural example, not as a source of unrelated code or branding. Record source and license constraints, keep the new effect `draft` until its live behavior is accepted, then rebuild and check the catalog index. Do not silently replace an existing effect or version.

## Update the library

Ordinary search and preview never run `git pull`. On an explicit update request, inspect local Git status and upstream changes, show effect version and migration changes, then update a clean local clone. A library update does not update any destination site by itself.
