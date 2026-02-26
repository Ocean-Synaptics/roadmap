# Integration Generation Design

## Goal

Users can run `roadmap integrate` to:
1. Auto-detect project metadata (type, build, dependencies)
2. Generate initial .roadmap.json
3. Validate against project structure
4. Bootstrap first agents

## Flow

```
roadmap integrate [--auto | --guided]
  ↓
1. Detect project type (package.json, go.mod, setup.py, Cargo.toml)
2. Discover build commands (npm run build, make, cargo build)
3. Scan for dependencies (.roadmap.json in siblings)
4. Generate metadata
  ↓
5. Verify: validate artifacts exist
6. Generate initial DAG (.roadmap/head.json)
  ↓
7. Orient to find position
8. Display next steps
```

## Auto Mode

No user input. Heuristic-driven:

```bash
$ roadmap integrate --auto
✓ Detected: typescript-monorepo
✓ Build command: npm run build
✓ Generated: .roadmap.json
✓ Position: bootstrap
✓ Next: run agents
```

## Guided Mode

Interactive wizard:

```bash
$ roadmap integrate --guided
Project type? (typescript/python/go/other): typescript
Build command (npm run build): [Enter]
Output dir (dist): [Enter]
Create .roadmap.json? yes
Detected dependencies:
  - ../fusion (dist/)
  - ../cockpit (dist/)
Include in roadmap? (y/n): y
✓ Generated: .roadmap.json
```

## Output

### .roadmap.json

```json
{
  "projectType": "typescript-monorepo",
  "init": ["package.json", "src/**/*.ts"],
  "term": ["dist/", "coverage/"],
  "buildCommand": "npm run build",
  "dependencies": [
    {
      "repo": "../fusion",
      "consumes": ["dist/"],
      "phase": "build",
      "mustComplete": true
    }
  ]
}
```

### .roadmap/head.json (initial DAG)

Auto-generated minimal DAG:

```json
{
  "id": "project-name",
  "desc": "Auto-generated roadmap",
  "init": "bootstrap",
  "term": "release",
  "nodes": {
    "bootstrap": {
      "produces": ["package.json"],
      "consumes": [],
      "deps": []
    },
    "build": {
      "produces": ["dist/"],
      "consumes": ["src/**/*.ts"],
      "deps": ["bootstrap"]
    },
    "test": {
      "produces": ["coverage/"],
      "consumes": ["dist/"],
      "deps": ["build"]
    },
    "release": {
      "produces": [],
      "consumes": ["dist/", "coverage/"],
      "deps": ["test"]
    }
  }
}
```

## Validation

After generation, verify:
- ✅ All declared artifacts exist or have build step
- ✅ No cycles in dependencies
- ✅ DAG can orient to current position
- ✅ All sibling repos are reachable

## Next

Phase 12: Implement auto-integration CLI and tests
