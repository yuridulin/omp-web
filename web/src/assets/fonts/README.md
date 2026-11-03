# Nerd Font symbols (fallback-only)

`web/src/styles/fonts.css` registers these files as the `"Nerd Symbols"` family,
listed after the real typefaces in `--font-ui` / `--font-mono`. omp writes
Nerd Font icons into session titles (and sometimes message text) from the
Private Use Area; without this font the browser paints them as tofu boxes
carrying the codepoint.

| File | Range | Size |
|---|---|---|
| `nerd-symbols-plane15.woff2` | `U+F0000-FFFFD` (Nerd Fonts v3 icons) | 384 KB |
| `nerd-symbols-bmp.woff2` | `U+E000-F8FF` (legacy aliases) | 608 KB |

Both are lazily fetched: the `unicode-range` on each `@font-face` means the
browser requests a file only when a rendered character needs it.

## Provenance

`Symbols Nerd Font` (symbols-only, proportional) from the official
[Nerd Fonts](https://github.com/ryanoasis/nerd-fonts) release **v3.5.1**
(`NerdFontsSymbolsOnly.zip` → `SymbolsNerdFont-Regular.ttf`), subset with
fonttools:

```sh
pyftsubset SymbolsNerdFont-Regular.ttf --unicodes="U+F0000-FFFFD" \
  --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --output-file=nerd-symbols-plane15.woff2
pyftsubset SymbolsNerdFont-Regular.ttf --unicodes="U+E000-F8FF" \
  --flavor=woff2 --layout-features='' --no-hinting --desubroutinize \
  --output-file=nerd-symbols-bmp.woff2
```

## Licence and attribution

The Nerd Fonts patcher output is MIT (`./LICENSE`). The bundled icon sets keep
their own licences, which the MIT file does not replace — see the icon-set
table in the upstream release README
(<https://github.com/ryanoasis/nerd-fonts/releases/tag/v3.5.1>):

- CC BY 4.0 — Codicons, Font Awesome
- Apache 2.0 — Material Design Icons
- MIT — Devicons, Font Awesome Extension, Octicons, Seti, Powerline Extra, Powerline Symbols, Power Symbols IEC, extraglyphs
- OFL 1.1 — Weather Icons; OFL 1.1 RFN — Pomicons
- unlicensed — Font Logos (shipped as upstream distributes it)

Attribution for the CC BY and OFL sets lives in that upstream table; keep this
file next to the fonts if you re-subset them.
