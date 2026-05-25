# OpenReplay Hetzner — Note install REAL

Acest fișier documentează **CE A FOST FĂCUT EFECTIV** pe Hetzner (2026-05-25),
pentru cazul în care trebuie recreat din zero. `install.sh` din folder e
versiunea generică pentru un VPS dedicat (k3s + Helm) — pe Hetzner am ales
**docker-compose behind NPM** fiindcă serverul e shared cu alte 2 apps.

Vezi CLAUDE.md §15 pentru context complet.

## Pași efectivi (single source of truth)

```bash
# 1) SSH pe Hetzner
ssh Hetzner

# 2) Clone repo OpenReplay
mkdir -p /home/apps/manele
cd /home/apps/manele
git clone --depth 1 https://github.com/openreplay/openreplay openreplay
cd openreplay/scripts/docker-compose

# 3) PATCH OBLIGATORIU docker-compose.yaml (înainte de install.sh!):
#    - nginx-openreplay primește port 127.0.0.1:9000 (fallback debug)
#    - caddy capătă profile "disabled" → nu pornește (NPM e pe :80/:443)
python3 << 'PY'
with open("docker-compose.yaml") as f:
    content = f.read()
content = content.replace(
    "    image: nginx:latest\n    container_name: nginx\n",
    "    image: nginx:latest\n    container_name: nginx\n    ports:\n      - \"127.0.0.1:9000:80\"\n",
    1,
)
content = content.replace(
    "    image: caddy:latest\n    container_name: caddy\n",
    "    image: caddy:latest\n    container_name: caddy\n    profiles:\n      - disabled\n",
    1,
)
with open("docker-compose.yaml", "w") as f:
    f.write(content)
PY

# 4) Rulez install.sh ATENȚIE — va face `git checkout` și RESETEAZĂ patch-ul!
#    Răspundem "n" la "public DNS?" ca să adauge SKIP_H_SSL=True în chalice.env
#    (HTTPS-ul e terminat de NPM, backend trebuie să știe).
printf "openreplay.manelecadou.ro\nn\n" | bash install.sh

# 5) Caddy-ul a încercat să bind :80 și a eșuat (normal, NPM e acolo).
#    Stop tot, RE-APLIC patch-ul, restart curat.
docker compose --profile migration down
# (re-rulez block-ul Python de la pasul 3)
COMPOSE_PROFILES=migration docker compose up -d

# 6) Conectez NPM la rețeaua OpenReplay PERMANENT
#    Editez /home/nginx-proxy-manager/docker-compose.yml — adaug:
#       networks: [proxy, openreplay]
#    Și la nivel top:
#       networks:
#         openreplay:
#           name: docker-compose_openreplay-net
#           external: true
#    Apoi:
cd /home/nginx-proxy-manager && docker compose up -d

# 7) În NPM UI (tunel ssh -L 8081:127.0.0.1:81 Hetzner → http://127.0.0.1:8081):
#    Adaug Proxy Host openreplay.manelecadou.ro → http://nginx-openreplay:80
#    Vezi CLAUDE.md §15.5 pentru toate câmpurile.

# 8) Verific:
curl -sI https://openreplay.manelecadou.ro/   # 200
echo | openssl s_client -servername openreplay.manelecadou.ro -connect 138.201.249.234:443 2>/dev/null | openssl x509 -noout -issuer -subject
# subject=CN=openreplay.manelecadou.ro, issuer=Let's Encrypt

# 9) Browser → https://openreplay.manelecadou.ro/signup → creare cont owner.
# 10) Preferences → Projects → Add → copiază Project Key.
# 11) PE IONOS:
#     ssh VPSIonos
#     echo "NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=<key>" >> /home/manele/.env
#     echo "NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=https://openreplay.manelecadou.ro/ingest" >> /home/manele/.env
#     # apoi local: make deploy-web
```

## Cum verifici că tracking-ul merge

După `make deploy-web` + browser pe https://manelecadou.ro:

1. Deschide DevTools → Network → filter `openreplay` → ar trebui să vezi POST-uri la
   `https://openreplay.manelecadou.ro/ingest/v1/web/start` și `.../web/i`
2. În dashboard OpenReplay → Sessions → apare sesiunea în max 60s
3. SQL pe Ionos:
   ```sql
   SELECT id, message, "openReplaySessionId" FROM error_logs
   WHERE "openReplaySessionId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 5;
   ```
   La fiecare error API trimis după activare, coloana e populată.

## Updates ulterioare

```bash
ssh Hetzner
cd /home/apps/manele/openreplay
git pull
cd scripts/docker-compose
# VERIFICĂ patch-urile docker-compose.yaml — dacă git pull le-a resetat,
# re-aplică Python-ul de la pasul 3 de mai sus.
grep -A1 "container_name: nginx" docker-compose.yaml   # vrem să vedem `127.0.0.1:9000:80`
grep -A1 "container_name: caddy" docker-compose.yaml   # vrem să vedem `profiles: [disabled]`
COMPOSE_PROFILES=migration docker compose up -d --pull always
```
