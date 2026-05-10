---
name: start-app
description: Pornește întreg stack-ul manelecadou (Postgres, Redis, Adminer, API NestJS, Web Next.js, Admin Next.js) și afișează toate URL-urile utile (web, admin, API, Adminer, site-uri multi-tenant locale, Bruno collection). Folosește această skill când userul cere "pornește aplicația", "start app", "ridică stack-ul" sau cere lista de linkuri.
---

# Start app — manelecadou

Pornește toate componentele și raportează URL-urile.

## Pași

1. **Verifică Docker rulează**
   ```bash
   docker info > /dev/null 2>&1 || echo "Docker nu rulează — pornește Docker Desktop întâi."
   ```

2. **Pornește backend stack (Postgres + Redis + Adminer + API)** din root:
   ```bash
   cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou" && docker compose up -d
   ```
   Folosește `-d` (detached) ca să nu blocheze conversația. Pentru hot-reload activ rulează `docker compose watch` separat în terminal.

3. **Așteaptă API healthy** (max ~30s):
   ```bash
   until curl -sf http://localhost:1501/api/health > /dev/null; do sleep 2; done
   ```

4. **Pornește Web (Next.js, port 1500)** în background:
   ```bash
   cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/web" && pnpm dev
   ```
   Rulează cu `run_in_background: true`.

5. **Pornește Admin (Next.js, port 1505)** în background:
   ```bash
   cd "/Users/serbanrusu/Desktop/Manele/Manele cadou/manelecadou/apps/admin" && pnpm dev
   ```
   Rulează cu `run_in_background: true`.

6. **Așteaptă ambele să răspundă**:
   ```bash
   until curl -sf http://localhost:1500 > /dev/null; do sleep 2; done
   until curl -sf http://localhost:1505 > /dev/null; do sleep 2; done
   ```

7. **Listează site-urile efectiv configurate în DB** (ca să afișezi doar domeniile reale, nu hardcoded):
   ```bash
   docker exec manelecadou-postgres-1 psql -U manelecadou -d manelecadou -tA -c \
     "SELECT slug, domain, locale, name FROM sites WHERE active = true ORDER BY \"isDefault\" DESC, slug;"
   ```

8. **Verifică ce e mapat în /etc/hosts** (ca să marchezi cu ✅/❌ fiecare domeniu local):
   ```bash
   grep -E '\.local' /etc/hosts || echo "(niciun domeniu .local mapat)"
   ```
   Dacă lipsesc, afișează userului comanda exactă:
   ```bash
   sudo sh -c 'echo "127.0.0.1 manelecadou.local manele-bg.local manele-rs.local manele-tr.local" >> /etc/hosts'
   ```

9. **Afișează tabelul de URL-uri complet** (vezi formatul de mai jos).

## URL-uri de raportat

```
🎵 Aplicație publică
  Web (RO default)        http://localhost:1500
  /studio                 http://localhost:1500/studio
  /cadou                  http://localhost:1500/cadou

🌍 Site-uri multi-tenant locale (din DB, status /etc/hosts)
  Pentru fiecare site din pasul 7, afișează:
    <name> (<locale>)       http://<domain>:1500   [✅ mapat / ❌ lipsește din /etc/hosts]
  Dacă vreunul lipsește, afișează userului comanda sudo de la pasul 8 cu domeniile lipsă concatenate.
  Plus testul direct cu Host header (nu necesită /etc/hosts):
    curl http://localhost:1501/api/public/site -H 'Host: <domain>'

🛠️  Admin panel
  Admin                   http://localhost:1505
  Login                   http://localhost:1505/login
  Sites management        http://localhost:1505/sites

🔌 API & infra
  API (NestJS)            http://localhost:1501
  Health                  http://localhost:1501/api/health
  Public site config      http://localhost:1501/api/public/site
  Adminer (DB UI)         http://localhost:1504  (server: postgres, user/pass/db: manelecadou)
  Postgres                localhost:1502
  Redis                   localhost:1503

🧪 Testing
  Bruno collection        /Users/serbanrusu/Documents/bruno/Proiecte Personale/collections/Manele
```

## Cum extragi magic link-ul de admin (pentru login)

```bash
docker logs manelecadou-api-1 2>&1 | grep -E '\[DEV\] magic link' | tail -1
```

Sau direct din DB:
```bash
docker exec manelecadou-postgres-1 psql -U manelecadou -d manelecadou -c \
  "SELECT token FROM magic_links ORDER BY \"createdAt\" DESC LIMIT 1;"
```

## Oprire

```bash
docker compose down            # opreste Postgres/Redis/API
# Pentru web/admin: KillShell pe shell-urile background
```

## Note

- Dacă `pnpm dev` nu există: `cd apps/web && pnpm install` (la fel pentru admin).
- Dacă portul 1500/1505 e ocupat: `lsof -ti:1500 | xargs kill -9`.
- `docker compose up -d` folosește `synchronize: true` din TypeORM — schema se aplică automat la prima rulare; seeder-ul populează site default + setări din `.env`.
- Dacă vrei hot-reload pe API: `docker compose watch` în loc de `up -d` (în terminal separat — blochează shell-ul).
