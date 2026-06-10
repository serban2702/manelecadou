# Container „ops" — Claude Code + terminal web (ttyd + tmux) pentru operare prod.
# Accesibil DOAR prin Caddy la admin.manelecadou.ro/ops/ (Basic Auth ttyd).
# Vezi CLAUDE.md §17.
FROM node:22-slim

# Unelte de operare: psql (DB prod prin rolul claude_ops), git (repo read-only),
# ripgrep (search-ul Claude Code), tmux (sesiuni persistente — taskurile lungi
# supraviețuiesc închiderii browserului), jq/curl (API intern).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git jq less nano procps postgresql-client ripgrep tmux \
    && rm -rf /var/lib/apt/lists/*

# ttyd — terminal web peste WebSocket. Binar static oficial, pin pe versiune.
ARG TTYD_VERSION=1.7.7
RUN curl -fsSL -o /usr/local/bin/ttyd \
      "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" \
    && chmod +x /usr/local/bin/ttyd

# Claude Code global. Non-root nu poate scrie în /usr/local → auto-updater oprit
# din env (DISABLE_AUTOUPDATER=1 în compose); update = rebuild imagine.
RUN npm install -g @anthropic-ai/claude-code

COPY bin/ops-admin-token /usr/local/bin/ops-admin-token
COPY bin/api-admin /usr/local/bin/api-admin
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/ops-admin-token /usr/local/bin/api-admin /entrypoint.sh

# User non-root. Home-ul (/home/claude) e volum persistent (ops_home) — ține
# credențialele Claude (~/.claude/.credentials.json), istoricul și tmux config,
# deci login-ul pe abonamentul Max supraviețuiește rebuild-urilor.
RUN useradd -m -s /bin/bash claude
USER claude
WORKDIR /workspace

EXPOSE 7681
ENTRYPOINT ["/entrypoint.sh"]
