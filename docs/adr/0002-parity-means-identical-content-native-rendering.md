# Parity means identical content, native rendering

All Libraries show the same Screens, routes, Mock Dataset, information, actions and Shell structure, but not the same pixels. Each Library keeps its natural look and component behavior, and a missing capability is shown as a Gap, never faked. This is why the comparison stays honest: forcing pixel identity would hide exactly the differences the repo exists to show. Parity is enforced by a Playwright suite that checks content and actions in both languages and never compares pixels.

## Considered Options

- **Pixel-identical Screens:** easier to diff, but it turns every Library into a themed copy of one design and erases what makes them different.
