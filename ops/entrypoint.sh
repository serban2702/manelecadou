#!/bin/bash
# Entrypoint container ops: terminal web (ttyd) cu sesiune tmux persistentă.
# Claude Code se pornește manual din terminal (`claude`) — login o singură dată,
# credențialele rămân pe volumul ops_home.
set -euo pipefail

# Workspace-ul (bind-mount /home/manele) e root-owned pe host — git refuză
# „dubious ownership" fără asta. Idempotent (home-ul e volum persistent).
git config --global --add safe.directory /workspace 2>/dev/null || true

# Profil minimal, scris o singură dată (marker `# ops-defaults`).
if ! grep -q '# ops-defaults' ~/.bashrc 2>/dev/null; then
  cat >> ~/.bashrc <<'RC'
# ops-defaults
export PS1='\[\e[38;5;220m\]ops\[\e[0m\]:\[\e[38;5;39m\]\w\[\e[0m\]\$ '
alias ll='ls -la'
cd /workspace 2>/dev/null || true
RC
fi

AUTH_ARGS=()
if [[ -n "${OPS_TERMINAL_CREDENTIAL:-}" ]]; then
  # Basic Auth la nivel ttyd (user:parolă din .env). Caddy doar proxy-ează.
  AUTH_ARGS=(-c "${OPS_TERMINAL_CREDENTIAL}")
fi

# -b /ops     → servit sub admin.manelecadou.ro/ops/ (reverse proxy Caddy)
# --writable  → input activ (din ttyd 1.7 default-ul e read-only)
# tmux new -A → atașare la sesiunea existentă sau creare; reconectarea din
#               browser regăsește EXACT aceeași sesiune (Claude Code cu tot
#               contextul), iar taskurile lungi rulează și cu browserul închis.
exec ttyd -p 7681 -b /ops --writable "${AUTH_ARGS[@]}" \
  -t titleFixed='Manele Ops — Claude Code' \
  -t fontSize=14 \
  -t 'theme={"background":"#0a0606","foreground":"#e8e3d8","cursor":"#d4af37"}' \
  tmux new -A -s ops
