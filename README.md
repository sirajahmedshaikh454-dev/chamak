# Chamak

**A truck-art studio in your browser.** Type a name or slogan, shuffle until a poster feels like yours, and download it as a PNG or SVG. Every poster is drawn from a seed, so a link brings back exactly the same one.

*Chamak* (چمک) means shine or sparkle, the word for the glitter on a painted truck. This is a single static page: no network, no accounts, no dependencies. Double-click `index.html`.

## What it makes

Pakistan's painted trucks and buses share a visual vocabulary: saturated flat colour, thick black outlines, repeating borders, a kaleidoscope flower, mirrored corner fans, and a banner of bold lettering. Chamak generates posters from that vocabulary:

- **Four nested border bands**: glitter dots, then chain links, beads or a zigzag, then a scalloped canopy, around a field with a diamond, dot or cross lattice.
- **A kaleidoscope medallion**: two rings of teardrop petals (8 to 16 petals, evenly spaced, the second ring offset half a step), a ring of beads and a star.
- **Four corner fans**, drawn once and mirrored, so the poster is symmetric by construction.
- **A row of flowers** and a **lettering banner** with an outlined, shadowed name. Urdu and other right-to-left text work; the browser's own font is used.
- **Six palettes** (Classic, Peacock, Marigold, Jade, Bazaar, Monsoon), **four shapes** (portrait, landscape, square, phone wallpaper), pattern density, and an optional fixed petal count.
- **History strip** to go back to a poster you liked, **Copy link** to share the exact poster, and **Space** to shuffle.

The art is generated from rules, not copied from any artist. It borrows a tradition's visual grammar; real truck painters are far more inventive than a program.

## How I know it works (measured)

The engine is pure, so it is tested without a browser (`npm test`, 19 tests, Node 18 or newer):

- **Deterministic**: the same seed gives byte-identical output; different seeds differ.
- **Always valid**: every palette and format gives well-formed SVG under 600 KB, including for seeds 0, negative and huge.
- **Safe text**: markup in the name or small line (`</text><script>...`) is escaped; control characters are removed; length is capped.
- **Readable lettering**: for all 6 palettes and 30 seeds each, the banner text has a WCAG contrast ratio of at least 4.5 against the banner.
- **Geometry**: petals are evenly spaced for every petal count, the second ring sits between the first ring's petals, the four corners are exact mirror images (the very same shapes with scale -1), the flower row is symmetric about the centre line and clears both the medallion and the banner in every format and seed.
- **Variety**: 60 seeds give at least 20 distinct layouts.
- **Fast**: 20 phone-size posters in well under 1.5 seconds.

In a real browser I verified the page end to end: the download button produces a real 1600 x 1200 PNG (about 660 KB, with content, not a blank canvas) and an SVG with no script; shuffling updates the share link; pasting a link into an open tab restores the exact poster; and the layout has no sideways scroll at phone width in light and dark. Looking at the posters caught a real defect that the first tests missed (the flower row hid behind the banner in landscape), which became a regression test.

## Honest limits

- **Not hand-painted.** Generated art is tidy; real truck art is wilder. Treat this as a starting point or a wallpaper.
- **Fonts come from your system.** Urdu text uses whatever Urdu-capable font your device has. A proper Nastaliq font will look better; without one you get a plain Naskh-style fallback.
- **PNG export relies on your browser** rendering the SVG to a canvas. It worked in the browser I tested; if a browser refuses, the SVG always works.
- Sharing a link shares the text you typed (it is in the address).

## Layout

```
index.html       the page
src/chamak.js    the art engine (pure functions)
src/app.js       controls, URL state, downloads (text is only ever inserted as text)
tests/           node:test, standard library only
tools/serve.js   tiny static server (npm run serve)
```

## Skills & methodology

**Method.** Start from the question "what would you actually want to make and share?" rather than "what checks something". Build the engine as pure functions so the rules can be proven by tests (determinism, symmetry, escaping, contrast), then look at the output with my own eyes, many seeds across palettes, formats and scripts, because art has failure modes tests do not catch. Each step was committed and pushed after the tests passed.

**Skills and tools.** Claude Code; the built-in browser for visual inspection (contact sheets of several seeds), real download verification (capturing the file the button produces and decoding it), and phone and dark-mode checks; an independent read-only review subagent that attacked the engine and page with hostile text, hash values and extreme settings. It confirmed 7 problems, all fixed with tests: a shared link such as `#palette=constructor` crashed the app (inherited object keys were treated as palettes), an emoji cut in half at the 40-character limit broke PNG export, the banner covered part of the corner fans in landscape and square, all-capital names could overflow the banner, odd file names, Space handling with modifier keys, and history de-duplication; the `ponytail` style (no dependencies, no build, smallest working design).

**Choices worth defending.** Corner fans are one shape drawn four times with mirror transforms, so symmetry cannot drift. The user's text can never become markup. The whole state lives in the URL, so a poster is reproducible and shareable without any server.

## License

MIT.
