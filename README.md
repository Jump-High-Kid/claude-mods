# claude-mods

Small [Claude Code](https://code.claude.com) mods.

| Mod | What it does |
|---|---|
| [usage-status](plugins/usage-status) | One line above the prompt: 5h/weekly usage with reset times, context %, repo, model and effort |

## Install

```bash
claude plugin marketplace add Jump-High-Kid/claude-mods
claude plugin install usage-status@jump-high-kid
```

Then run `/reload-plugins` in a session, or start a new one. Update with `claude plugin update usage-status@jump-high-kid`.

## Similar mods

If you want more (rings, chips, cost, multiple providers), look at
[kreddevils18/claude-usage-mod](https://github.com/kreddevils18/claude-usage-mod),
[lurenxing628/claude-code-mod-statusline](https://github.com/lurenxing628/claude-code-mod-statusline) or
[uppinote20/claude-dashboard](https://github.com/uppinote20/claude-dashboard).
This one stays a single quiet line.

## License

MIT
