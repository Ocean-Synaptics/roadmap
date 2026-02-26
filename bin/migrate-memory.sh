#!/usr/bin/env bash

# migrate-memory.sh — Migration script for roadmap v0.5.0 → v0.6.0
# Sets up memory infrastructure for early adopters (Mac + Linux)
# Idempotent: safe to run multiple times

set -e

# ============================================================================
# Detect platform
# ============================================================================

OS_TYPE=$(uname -s)
case "$OS_TYPE" in
  Darwin)
    PLATFORM="mac"
    ;;
  Linux)
    PLATFORM="linux"
    ;;
  *)
    echo "❌ Unsupported platform: $OS_TYPE (only Mac and Linux supported)"
    exit 1
    ;;
esac

# ============================================================================
# Configuration
# ============================================================================

REPO_ROOT="${1:-.}"
GLOBAL_MEMORY_HOME="${HOME}/.roadmap/memory"
LOCAL_MEMORY_DIR="${REPO_ROOT}/.roadmap/memory"

# ============================================================================
# Utility functions
# ============================================================================

log_info() {
  echo "ℹ️  $1"
}

log_success() {
  echo "✅ $1"
}

log_warn() {
  echo "⚠️  $1"
}

is_git_repo() {
  git -C "$1" rev-parse --git-dir >/dev/null 2>&1
}

symlink_exists() {
  [ -L "$1" ]
}

symlink_points_to() {
  [ "$(readlink "$1")" = "$2" ]
}

# ============================================================================
# Step 1: Create local .roadmap/memory/ directory
# ============================================================================

if [ -d "$LOCAL_MEMORY_DIR" ]; then
  log_info "Local memory dir already exists: $LOCAL_MEMORY_DIR"
else
  log_info "Creating local memory directory: $LOCAL_MEMORY_DIR"
  mkdir -p "$LOCAL_MEMORY_DIR"
  log_success "Created $LOCAL_MEMORY_DIR"
fi

# ============================================================================
# Step 2: Symlink MEMORY.md → /dev/null (suppress global memory in repo)
# ============================================================================

MEMORY_FILE="${REPO_ROOT}/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
  if symlink_exists "$MEMORY_FILE"; then
    if symlink_points_to "$MEMORY_FILE" "/dev/null"; then
      log_info "MEMORY.md already symlinked to /dev/null"
    else
      log_warn "MEMORY.md is symlinked elsewhere; not overwriting"
    fi
  else
    log_info "Removing MEMORY.md file and replacing with /dev/null symlink"
    rm -f "$MEMORY_FILE"
    ln -s /dev/null "$MEMORY_FILE"
    log_success "Symlinked MEMORY.md → /dev/null"
  fi
elif symlink_exists "$MEMORY_FILE"; then
  if symlink_points_to "$MEMORY_FILE" "/dev/null"; then
    log_info "MEMORY.md already symlinked to /dev/null"
  else
    log_warn "MEMORY.md is symlinked elsewhere; not overwriting"
  fi
else
  log_info "MEMORY.md does not exist; creating symlink"
  ln -s /dev/null "$MEMORY_FILE"
  log_success "Created MEMORY.md → /dev/null symlink"
fi

# ============================================================================
# Step 3: Initialize ~/.roadmap/memory/ as standalone git repo
# ============================================================================

if [ -d "$GLOBAL_MEMORY_HOME" ]; then
  if is_git_repo "$GLOBAL_MEMORY_HOME"; then
    log_info "Global memory repo already initialized: $GLOBAL_MEMORY_HOME"
  else
    log_info "Global memory dir exists but is not a git repo; initializing"
    git -C "$GLOBAL_MEMORY_HOME" init
    log_success "Initialized git repo in $GLOBAL_MEMORY_HOME"
  fi
else
  log_info "Creating global memory home: $GLOBAL_MEMORY_HOME"
  mkdir -p "$GLOBAL_MEMORY_HOME"
  git -C "$GLOBAL_MEMORY_HOME" init
  log_success "Created and initialized git repo in $GLOBAL_MEMORY_HOME"
fi

# ============================================================================
# Step 4: Create global memory .gitignore (if not present)
# ============================================================================

GLOBAL_GITIGNORE="${GLOBAL_MEMORY_HOME}/.gitignore"
if [ ! -f "$GLOBAL_GITIGNORE" ]; then
  log_info "Creating .gitignore in global memory repo"
  cat > "$GLOBAL_GITIGNORE" << 'EOF'
# Ignore temporary files
*.tmp
*.swp
*~
.DS_Store
node_modules/
.env
.env.local

# Ignore session-local data
.session
*.lock
EOF
  log_success "Created $GLOBAL_GITIGNORE"
else
  log_info "$GLOBAL_GITIGNORE already exists"
fi

# ============================================================================
# Step 5: Create global memory README (if not present)
# ============================================================================

GLOBAL_README="${GLOBAL_MEMORY_HOME}/README.md"
if [ ! -f "$GLOBAL_README" ]; then
  log_info "Creating README in global memory repo"
  cat > "$GLOBAL_README" << 'EOF'
# Roadmap Global Memory

This repository stores cross-project and long-lived memory for the roadmap system.

## Structure

- `*.md` — Topic-specific memory files (semantically organized)
- `projects/` — Per-project memory (one dir per repo)
- `swarms/` — Swarm session memory (collective coordination)

## Usage

Run `/home/griffin/src/roadmap/bin/migrate-memory.sh` in any repo to enable local memory.

Each session can read/write to `~/.roadmap/memory/` as a shared git repository.
EOF
  log_success "Created $GLOBAL_README"
else
  log_info "$GLOBAL_README already exists"
fi

# ============================================================================
# Step 6: Verify and summary
# ============================================================================

log_info ""
log_success "Migration complete!"
log_info ""
log_info "Summary:"
log_info "  - Local memory dir: $LOCAL_MEMORY_DIR"
log_info "  - Global memory home: $GLOBAL_MEMORY_HOME"
log_info "  - Platform: $PLATFORM"
log_info ""
log_info "Next steps:"
log_info "  1. Check: test -d $LOCAL_MEMORY_DIR && echo 'Local ready'"
log_info "  2. Check: test -d $GLOBAL_MEMORY_HOME && git -C $GLOBAL_MEMORY_HOME status"
log_info "  3. Use: /home/griffin/src/roadmap/bin/roadmap orient --note 'session start'"
