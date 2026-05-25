# OpenReplay self-hosted

Integrare OpenReplay self-hosted cu platforma manelecadou. Tracking de
sesiuni full-fidelity (DOM + network + console + performance), fără banner
de consent, cu identificare user și corelare cu erori/plăți/generations
din DB.

## Arhitectură

```
┌──────────────────────────┐         ┌──────────────────────────┐
│ VPS principal (manele)   │         │ VPS dedicat OpenReplay   │
│  - api / web / admin     │  HTTPS  │  - k3s + traefik         │
│  - postgres / redis      │ ───────►│  - OpenReplay (helm)     │
│  - caddy                 │ ingest  │  - postgres / redis / ch │
│                          │         │  - minio / kafka / nats  │
│ manelecadou.ro           │         │ openreplay.manelecadou.ro│
└──────────────────────────┘         └──────────────────────────┘

apps/web injectează tracker → trimite events către
https://openreplay.manelecadou.ro/ingest

Browser trimite în paralel către API-ul principal:
  fetch(/api/...) cu header `X-OpenReplay-SessionID: <session>`

Backend (apps/api):
  - OpenReplayMiddleware extrage header → AsyncLocalStorage
  - OpenReplaySubscriber (TypeORM) la INSERT pe Payment/Generation/ErrorLog
    completează coloana `openReplaySessionId` din storage
  - Admin poate face apoi link clicabil în dashboard OpenReplay
    pentru orice rând din DB
```

## Cum se instalează (Faza B)

**Prerequisites**:
- VPS Ubuntu 24.04 LTS, minim 16GB RAM / 4 vCPU / 100GB SSD
- Acces SSH root
- A record DNS `openreplay.manelecadou.ro` → IP-ul VPS-ului (poate fi adăugat
  după install, dar e mai bine înainte ca TLS-ul Let's Encrypt să meargă la
  prima accesare)

**Pași**:

```bash
# 1. SSH pe VPS-ul nou
ssh root@<IP_NOU>

# 2. Descarcă & rulează scriptul de bootstrap
curl -fsSL https://raw.githubusercontent.com/serban2702/manelecadou/main/scripts/openreplay/install.sh \
  -o /root/openreplay-install.sh
chmod +x /root/openreplay-install.sh
OPENREPLAY_DOMAIN=openreplay.manelecadou.ro /root/openreplay-install.sh

# 3. Așteaptă ~10-20 min ca toate pod-urile să fie Running
kubectl -n app get pods -w

# 4. Vizitează https://openreplay.manelecadou.ro și creează contul admin

# 5. Preferences → Projects → "+ Add Project" → "manelecadou-web"
#    → copiază Project Key

# 6. PE VPS-UL PRINCIPAL — editează .env
ssh VPSIonos
nano /home/manele/.env
# Adaugă:
#   NEXT_PUBLIC_OPENREPLAY_PROJECT_KEY=<cheia copiată>
#   NEXT_PUBLIC_OPENREPLAY_INGEST_POINT=https://openreplay.manelecadou.ro/ingest

# 7. Rebuild web (build args propagate cheile în Next.js):
make deploy-web

# 8. Verifică: deschide https://manelecadou.ro → sesiunea ar trebui
#    să apară în OpenReplay în maxim 60s.
```

## Verificare integrare backend

Browser trimite automat `X-OpenReplay-SessionID` la fiecare request fetch
(prin patch în `apps/web/lib/api.ts`).

**Test rapid** — provoacă o eroare client-side intenționat și verifică în
admin:

```sql
SELECT id, message, "openReplaySessionId", "createdAt"
FROM error_logs
WHERE "openReplaySessionId" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 5;
```

Apoi în OpenReplay: Sessions → caută după session ID. Match exact = funcționează.

## Resurse OpenReplay

- Docs: <https://docs.openreplay.com/en/deployment/deploy-aws/>
- Source: <https://github.com/openreplay/openreplay>
- SDK config: <https://docs.openreplay.com/en/sdk/constructor/>
- Resource minimum: 16GB RAM recomandat single-node (a se vedea
  `scripts/helmcharts/openreplay/charts/`).

## Operațiuni

```bash
# Status:
kubectl -n app get pods

# Loguri serviciu (ex: frontend):
kubectl -n app logs -l app=frontend --tail=200

# Restart un serviciu:
kubectl -n app rollout restart deploy/frontend

# Update versiune OpenReplay:
cd /opt/openreplay && git pull
cd scripts/helmcharts && bash openreplay.sh -u

# Backup ClickHouse (sesiuni vechi sunt deja persistate pe MinIO):
# vezi docs OpenReplay - "Backup and Restore"
```

## GDPR & masking

Configul curent (în `apps/web/components/OpenReplay.tsx`):
- `defaultInputMode: 0` (Plain) — toate input-urile vizibile
- `obscureTextEmails: false`, `obscureTextNumbers: false` — vede emailuri/cifre
- Câmpurile sensibile sunt mascate AUTOMAT de SDK:
  - `input[type=password]` — întotdeauna mascat
  - Stripe Elements (carduri) — în iframe cross-origin, invizibil by design
- Decizie userului 2026-05-25: **fără banner de consent** (vezi CLAUDE.md).
  Riscul GDPR/ePrivacy în EU rămâne la owner.

Dacă pe viitor vrei să mascheazi explicit alte câmpuri:
- adaugă `data-openreplay-hidden` pe elementul DOM
- sau `data-openreplay-masked` pentru a păstra structura dar masca textul
