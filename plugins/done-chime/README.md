# done-chime

A minimal Claude Code mod: a short sound when you can stop waiting.

- **Done**: a two-note marimba rise when a turn that took **30 s or more** finishes. Subagent turns and turns you interrupted (Esc) stay silent.
- **Needs you**: three quick soft beeps when a **permission prompt** is waiting.

Both are multi-note motifs, so they don't sound like macOS's single-tone alerts. The WAVs are synthesized for this mod (MIT, like the code).

## Toggle

```
/chime off   # silence
/chime on    # sound back
/chime       # toggle
```

The setting persists across sessions. Default: on.

## Notes

- Mods are **early access** in Claude Code; the API may change between releases. Built and tested on **2.1.289**.
- Sound plays through `afplay`, so **macOS only**. Linux and Windows terminals play nothing.

## Develop

```bash
claude plugin validate .
claude plugin test .
```
