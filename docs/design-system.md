# Design system

The current theme is **Aurora Glass**, defined centrally at the top of `src/style.css` with CSS custom properties such as `--panel`, `--accent`, `--muted`, `--line`, and `--shadow`. Components use those semantic tokens instead of choosing colors independently.

To add another theme, add a class or data attribute on the application root and override the same variables:

```css
[data-theme="ember"] {
  --accent: #ff9a76;
  --accent-strong: #e36a4f;
  --cyan: #ffd166;
}
```

The visual language uses translucent panels, backdrop blur, thin borders, soft gradients, generous spacing, and restrained accent colors. The interface remains usable without the remote font import so core features stay offline.
