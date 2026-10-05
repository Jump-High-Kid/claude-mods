# usage-status

A minimal Claude Code mod: one line above the prompt.

```
Current session 56% · 1:50pm   Current week 69% · 9am   Context 11%   my-repo Opus 5.5 (1M) · high
```

- **Current session / Current week**: the 5-hour and weekly limits, worded as `/usage` does, with the reset time
- **Context**: how full this conversation's context window is
- **repo · model · effort**: the git repository's folder name, the main loop's model, and the effort actually sent

Percentages turn the theme's warning color at 70% and error at 100%. No dependencies, no network, no file access: it only reads the session's own figures.

## Notes

- Mods are **early access** in Claude Code; the API may change between releases. Built and tested on **2.1.289**.
- Usage limits appear on Pro/Max subscriptions only. With an API key you get Context and repo/model/effort.
- Effort updates on the next request, not the moment you run `/effort` (there is no event for it).
- Context is hidden until the first response, and right after a compaction.

## Develop

```bash
claude plugin validate .
claude plugin test .
```
