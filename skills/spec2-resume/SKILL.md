---
name: spec2-resume
executable: true
entry_point: resume.ts
export: execute
arguments: []
---

# /spec2-resume — Resume Interrupted Build

Resumes a Spec2 build from the last successful checkpoint. Automatically detects the last completed wave and continues from there.

## Features

- Loads checkpoint from `.spec2/checkpoints/latest.json`
- Restores full project state (specs, components, artifacts)
- Continues from next wave after last checkpoint
- Validates checkpoint integrity before resuming
- Works seamlessly with /spec2-new workflow

## Usage

```bash
# If build failed or was interrupted
/spec2-resume
```

## How It Works

1. Loads checkpoint JSON
2. Validates required state exists
3. Determines next wave to execute
4. Resumes orchestration from that point
5. Continues with normal validation + regeneration

## Resumable Waves

- After Wave 1: Resumes at Wave 2 (Subsystem Specs)
- After Wave 2: Resumes at Wave 3 (Component Specs)
- After Wave 3: Resumes at Wave 4 (Integration Spec)
- After Wave 4: Resumes at Wave 5 (Artifacts)
- After Wave 5: Resumes at Wave 6 (Code Generation)
- After Wave 6: Build already complete

## See Also

- `/spec2-new` - Start new build
- `/spec2-status` - Check current progress
