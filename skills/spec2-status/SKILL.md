---
name: spec2-status
executable: true
entry_point: status.ts
export: execute
arguments: []
---

# /spec2-status — Show Current Project Status

Displays the current state of a Spec2 project, including completed waves and checkpoint information.

## Features

- Shows completed waves
- Displays checkpoint timestamp
- Indicates which phase can be resumed next
- Works for both in-progress and completed builds

## Usage

```bash
/spec2-status
```

## Output

Shows:
- Last checkpoint timestamp
- Target language
- Completed waves (✓)
- Next resumable phase (if incomplete)
- Build completion status

## See Also

- `/spec2-new` - Start new build
- `/spec2-resume` - Resume from checkpoint
