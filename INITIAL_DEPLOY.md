# Deploy inițial pe VPS — pas cu pas

Acest document descrie **prima rulare** a aplicației pe un VPS gol. Pentru adăugare de site-uri ulterioare, vezi `ADD_NEW_SITE.md`. Pentru concept multi-tenant și `Caddyfile`, vezi `MULTISITE_DEPLOY.md`.

---

## 0. Premise

- VPS proaspăt (Hetzner / DigitalOcean / Contabo) — minim **2 GB RAM, 2 vCPU, 40 GB SSD**, Debian 12 sau Ubuntu 22.04+.
- Domeniu cumpărat (ex. `manelecadou.ro`).
- Cont Stripe (mod Live, RO, payout RON).
- Cont OpenAI cu API key.
- Cont sunoapi.org cu credit.
- Mailgun (sau alt SMTP) pentru transactional email.

---

## 1. Securizare VPS de bază

```bash
ssh root@<IP_VPS>

# Update sistem
apt update && apt upgrade -y

# User non-root
adduser deploy
usermod -aG sudo deploy

# SSH key only (dezactivează parolă)
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Editează /etc/ssh/sshd_config:
#   PermitRootLogin no
#   PasswordAuthentication no
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Firewall (UFW)
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Fail2ban
apt install -y fail2ban
systemctl enable --now fail2ban
```

De acum încolo loghează-te ca `deploy`:
```bash
ssh deploy@<IP_VPS>
```

---

## 2. Instalare Docker + Compose

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Permite docker fără sudo
sudo usermod -aG docker $USER
newgrp docker

docker --version
docker compose version
```

---

## 3. Clone repo + structură directoare

```bash
sudo mkdir -p /srv/manelecadou
sudo chown deploy:deploy /srv/manelecadou
cd /srv

git clone <URL_REPO_TĂU> manelecadou
cd manelecadou
```

---

## 4. DNS — A records pentru domeniul principal

La registrar (Cloudflare / GoDaddy / OVH) creează:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `manelecadou.ro` | `<IP_VPS>` | 300 |
| A | `www.manelecadou.ro` | `<IP_VPS>` | 300 |
| A | `api.manelecadou.ro` | `<IP_VPS>` | 300 |
| A | `admin.manelecadou.ro` | `<IP_VPS>` | 300 |

Aștepți 5-30 min. Verifică:
```bash
dig +short manelecadou.ro
dig +short api.manelecadou.ro
dig +short admin.manelecadou.ro
# toate trebuie să returneze <IP_VPS>
```

---

## 5. `.env` de producție

```bash
cd /srv/manelecadou
cp .env.example .env  # sau creează direct
nano .env
```

Setează **minim** (restul se configurează din admin după prima rulare):

```env
# Default site (root config — celelalte se adaugă din admin)
DEFAULT_SITE_DOMAIN=manelecadou.ro
APP_URL=https://manelecadou.ro
ADMIN_URL=https://admin.manelecadou.ro
API_URL=https://api.manelecadou.ro

# Database
POSTGRES_USER=manelecadou
POSTGRES_PASSWORD=<parolă-puternică-32-chars>
POSTGRES_DB=manelecadou

# Auth
JWT_SECRET=<random-64-chars>
SETTINGS_ENCRYPTION_KEY=<random-32-bytes-hex>

# Admin bootstrap (super-admin la primul start)
ADMIN_EMAILS=tu@example.com

# Secrets externe (alternativ se pun din admin /settings după prima rulare)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...   # îl iei după ce setezi webhook-ul (vezi pas 9)
OPENAI_API_KEY=sk-...
SUNO_API_KEY=...

# Mailgun (sau orice SMTP)
MAIL_PROVIDER=mailgun
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=mg.manelecadou.ro
MAIL_FROM=salut@manelecadou.ro

NODE_ENV=production
```

**Generare random:**
```bash
openssl rand -hex 32     # pentru JWT_SECRET
openssl rand -hex 16     # pentru SETTINGS_ENCRYPTION_KEY (32 chars hex = 16 bytes; folosește hex 64 = 32 bytes pentru AES-256)
openssl rand -hex 32     # pentru POSTGRES_PASSWORD
```

---

## 6. Caddyfile — verifică

`Caddyfile` din root e deja gata (vezi `MULTISITE_DEPLOY.md`). Verifică doar:
- Email-ul Let's Encrypt e corect (`email admin@manelecadou.ro`).
- Hosturile speciale (`api.manelecadou.ro`, `admin.manelecadou.ro`) corespund domeniului tău.

---

## 7. Prima rulare

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Urmărește log-urile
docker compose -f docker-compose.prod.yml logs -f api
```

La primul start API-ul:
1. Conectează la Postgres (creează schema cu `synchronize: true` → toate tabelele).
2. `SitesService.onModuleInit` creează **site-ul default** (`DEFAULT_SITE_DOMAIN`).
3. `SeederService.seedSettingsFromEnv()` populează tabelul `app_settings` cu cheile din `.env` (criptate AES-GCM).
4. Așteaptă request-uri.

Caddy:
1. Pornește pe `:80` și `:443`.
2. La primul request HTTPS pe `manelecadou.ro` → întreabă `/api/internal/caddy/ask?domain=manelecadou.ro` → API confirmă (e site activ) → Caddy cere cert Let's Encrypt.
3. Cert obținut → site live.

**Verifică:**
```bash
curl -I https://manelecadou.ro
# expected: HTTP/2 200, server: Caddy

curl https://api.manelecadou.ro/health
# expected: {"status":"ok"}
```

---

## 8. Login admin (prima dată)

1. Mergi la `https://admin.manelecadou.ro/login`.
2. Introdu email-ul din `ADMIN_EMAILS` (din `.env`).
3. Primești magic link pe email (sau în log dacă SMTP-ul nu e configurat încă):
   ```bash
   docker compose -f docker-compose.prod.yml logs api | grep '\[DEV\] magic link'
   ```
4. Click pe link → ești logat ca super-admin.

**De aici poți gestiona TOTUL din UI:**
- `/sites` — adaugă/editează site-uri (domains, prețuri, prompturi Suno, branding)
- `/settings` — actualizează secrets (Stripe key, OpenAI key, SUNO key, Mailgun) fără să modifici `.env`
- `/users`, `/payments`, `/generations`, `/analytics` etc.

---

## 9. Stripe webhook

Stripe e **un singur cont** pentru toate site-urile. Webhook-ul e unic.

1. În Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
   - URL: `https://api.manelecadou.ro/api/payments/webhook`
   - Events: `checkout.session.completed`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
2. Copiază **Signing secret** (`whsec_...`).
3. Setează-l în admin `/settings` sau în `.env` (`STRIPE_WEBHOOK_SECRET`) și restart API:
   ```bash
   docker compose -f docker-compose.prod.yml restart api
   ```
4. Test: în Stripe → Webhook → **Send test event** → verifică în log-uri că e procesat fără 401.

---

## 10. Backup-uri (cron)

```bash
sudo mkdir -p /backups
sudo chown deploy:deploy /backups

# crontab -e
0 3 * * * docker exec manelecadou-postgres-1 pg_dump -U manelecadou manelecadou | gzip > /backups/db_$(date +\%F).sql.gz
0 4 * * 0 find /backups -name 'db_*.sql.gz' -mtime +30 -delete
```

Plus: download săptămânal pe local cu `rsync`:
```bash
rsync -avz deploy@<IP_VPS>:/backups/ ~/manelecadou-backups/
```

---

## 11. Monitoring de bază

```bash
# Status containere
docker compose -f docker-compose.prod.yml ps

# Resurse
docker stats --no-stream

# Disk
df -h

# Caddy certificate
docker compose -f docker-compose.prod.yml exec caddy caddy list-certificates
```

Pentru monitoring real (uptime, alerting):
- **UptimeRobot** (free) — ping pe `https://manelecadou.ro/`, `https://api.manelecadou.ro/health`.
- **Sentry** — adaugă `SENTRY_DSN` în `.env` (deja integrat în API + Web).

---

## 12. Update / redeploy

```bash
cd /srv/manelecadou
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate

# Verifică
docker compose -f docker-compose.prod.yml logs -f --tail=50 api
curl -I https://manelecadou.ro
```

⚠️ **Backup DB înainte de update**:
```bash
docker exec manelecadou-postgres-1 pg_dump -U manelecadou manelecadou | gzip > /backups/pre-update_$(date +%F-%H%M).sql.gz
```

---

## 13. Adăugare site nou (după ce e totul live)

Vezi `ADD_NEW_SITE.md` — pe scurt:
1. A record DNS spre VPS.
2. Admin → `/sites` → Adaugă site.
3. Caddy obține certul automat la primul request HTTPS.

---

## Troubleshooting deploy inițial

### Caddy nu obține certul Let's Encrypt
- Verifică DNS: `dig +short manelecadou.ro` returnează `<IP_VPS>`.
- Verifică firewall: porturile `80` și `443` sunt deschise (Let's Encrypt validează prin HTTP-01 challenge).
- `docker compose -f docker-compose.prod.yml logs caddy | tail -50` — caută `obtain certificate` și erori.
- Rate limit Let's Encrypt: 50 cert/săptămână per domeniu rădăcină. Dacă faci redeploy frecvent în dev, folosește `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` în Caddyfile temporar.

### `/api/internal/caddy/ask` returnează 403
- Site-ul nu există în DB sau e `active = false`.
- Verifică:
  ```bash
  docker exec manelecadou-postgres-1 psql -U manelecadou -d manelecadou -c \
    "SELECT slug, domain, active FROM sites;"
  ```

### Magic link nu vine pe email
- SMTP nu e configurat. Tokenul e în log:
  ```bash
  docker compose -f docker-compose.prod.yml logs api | grep '\[DEV\] magic link'
  ```
- După ce configurezi Mailgun în `.env` sau `/settings` → restart API.

### `synchronize: true` eșuează la index-uri compus
Dacă ai venit dintr-o DB single-tenant existentă cu rânduri orfane fără `siteId`:
1. Oprește API: `docker compose -f docker-compose.prod.yml stop api`.
2. Manual: `UPDATE generations SET "siteId" = '<default-site-id>' WHERE "siteId" IS NULL;` (idem pentru toate tabelele cu siteId).
3. Repornește.

### CORS blocked după ce adaug un site nou
CORS-ul citește dinamic domeniile active din DB (`SitesService.listActiveDomains()` cu cache 30s). Dacă vrei flush instant, restart API.

---

## Checklist final

- [ ] VPS securizat (SSH key only, UFW, fail2ban)
- [ ] Docker + Compose instalate
- [ ] Repo clonat în `/srv/manelecadou`
- [ ] `.env` populat cu secrets
- [ ] DNS A records create și propagate
- [ ] `docker compose up -d` rulează fără erori
- [ ] `https://manelecadou.ro` returnează 200
- [ ] `https://api.manelecadou.ro/health` returnează `{"status":"ok"}`
- [ ] Login admin funcționează (magic link primit)
- [ ] Stripe webhook configurat și test event procesat
- [ ] Backup cron activ
- [ ] UptimeRobot configurat (sau alt monitoring)
