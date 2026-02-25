# Session entry — roadmap/

Read `orientation.md`. Run `orient()` to confirm position:

```bash
node --experimental-strip-types - <<'EOF'
import { orient } from './src/protocol.ts';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const o = orient(roadmap, a => existsSync(join(process.cwd(), a)));
console.log('position:', o.position);
console.log('done:', o.done);
console.log('remaining:', o.remaining);
EOF
```

Present current position and capabilities, then ask:

```
Ready. Choose execution mode:
[1] Semi-autonomous — execute next phase group, stop and present results + options
[2] Fully autonomous — execute all remaining phases to term without stopping
```

Do not proceed until a mode is chosen.
