#!/usr/bin/env bash
# OpenReplay self-hosted — bootstrap pe VPS dedicat Ubuntu 24.04.
#
# Rulează ca root pe VPS-ul gol care va găzdui DOAR OpenReplay.
# Nu rula pe VPS-ul care găzduiește deja manelecadou (stack-ul principal).
#
# Variabile (override prin env):
#   OPENREPLAY_DOMAIN   - default openreplay.manelecadou.ro
#   LETSENCRYPT_EMAIL   - email pentru notificări LE; default serban2702@gmail.com
#
# Ce face:
#   1. Apt update + deps (curl, git, helm)
#   2. UFW open 22/80/443
#   3. Instalează k3s (single-node, traefik enabled)
#   4. Instalează Helm 3
#   5. Clonează openreplay în /opt/openreplay
#   6. Configurează vars.yaml minimal
#   7. Rulează scripts/helmcharts/openreplay.sh -i (installer oficial)
#
# DUPĂ install (manual):
#   - Pune A record DNS: $OPENREPLAY_DOMAIN → IP-ul VPS-ului acesta
#   - Așteaptă 2-5 min să se ridice toate pod-urile (kubectl -n app get pods)
#   - Vizitează https://$OPENREPLAY_DOMAIN, creează cont admin
#   - Preferences → Projects → copiază Project Key
#   - Pe VPS-ul principal: pune cheia în .env și rulează `make deploy-web`

set -euo pipefail

OPENREPLAY_DOMAIN="${OPENREPLAY_DOMAIN:-openreplay.manelecadou.ro}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-serban2702@gmail.com}"

log() { echo "[openreplay-install] $*" >&2; }
require_root() { [[ $EUID -eq 0 ]] || { log "ERROR: trebuie rulat ca root"; exit 1; }; }

require_root

log "Pasul 1/7: apt update + deps de bază"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates jq apt-transport-https gnupg lsb-release ufw

log "Pasul 2/7: configurez UFW (22, 80, 443, 6443)"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
# 6443 e API-ul k3s; dacă vrei să-l restricționezi, lasă-l fără regulă
# (k3s ascultă pe 6443 oricum, dar accesibil doar pe loopback dacă nu deschizi în UFW).
yes | ufw enable || true

log "Pasul 3/7: instalez k3s (single-node, traefik enabled)"
if command -v k3s &>/dev/null; then
  log "k3s already installed; skipping"
else
  curl -sfL https://get.k3s.io | sh -
fi
mkdir -p /root/.kube
cp /etc/rancher/k3s/k3s.yaml /root/.kube/config
chmod 600 /root/.kube/config
export KUBECONFIG=/root/.kube/config

log "Pasul 4/7: instalez Helm 3"
if command -v helm &>/dev/null; then
  log "helm already installed; skipping"
else
  curl -fsSL https://baltocdn.com/helm/signing.asc | gpg --dearmor -o /usr/share/keyrings/helm.gpg
  echo "deb [signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" \
    > /etc/apt/sources.list.d/helm-stable-debian.list
  apt-get update -y
  apt-get install -y helm
fi

log "Pasul 5/7: clonez OpenReplay în /opt/openreplay"
if [[ -d /opt/openreplay/.git ]]; then
  log "repo already cloned; updating"
  cd /opt/openreplay
  git pull --ff-only || log "git pull failed; continuă cu HEAD actual"
else
  git clone https://github.com/openreplay/openreplay /opt/openreplay
fi

log "Pasul 6/7: generez vars.yaml minimal"
cd /opt/openreplay/scripts/helmcharts
# Setări safe pentru single-node behind traefik. Restul defaults la chart.
cat > vars.yaml <<EOF
global:
  domainName: "${OPENREPLAY_DOMAIN}"
  enterpriseEditionLicense: ""
  forceSSL: "true"
ingress-nginx:
  enabled: false
EOF

log "Pasul 7/7: rulez openreplay.sh -i (poate dura 10-20 min)"
log "  Dacă scriptul cere input interactiv, va trebui să răspunzi din SSH."
bash openreplay.sh -i || log "openreplay.sh a returnat non-zero — verifică manual: kubectl -n app get pods"

PUBLIC_IP="$(curl -s -4 ifconfig.me || echo '???')"
cat <<EOF

============================================================
✅ OpenReplay bootstrap COMPLET (sau încercat).

🔎 Verifică status pod-uri:
   kubectl -n app get pods

📌 PAȘI MANUALI (NU sunt automatizați):

  1. DNS la Cloudflare (DNS only, gri):
       ${OPENREPLAY_DOMAIN}  →  A  →  ${PUBLIC_IP}

  2. Așteaptă 2-5 min ca toate pod-urile să fie Running:
       watch kubectl -n app get pods

  3. Vizitează https://${OPENREPLAY_DOMAIN}
     (TLS-ul e emis automat de traefik via Let's Encrypt la prima
     accesare HTTPS — așteaptă ~30s prima dată)

  4. Creează cont admin (primul cont devine owner automat).

  5. În dashboard → Preferences → Projects:
       Click "+ Add Project", denumește-l "manelecadou-web"
       → copiază "Project Key" (string scurt, ex: a1b2c3...)

  6. PE VPS-UL PRINCIPAL (manelecadou stack), editează /home/manele/.env:
       NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=<cheia copiată>
       NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=https://${OPENREPLAY_DOMAIN}/ingest

  7. Rebuild web:
       make deploy-web
============================================================
EOF
