# Monitor credite Suno + alerte Wingo

Sistem care urmărește soldul de credite din contul **sunoapi.org** și trimite
alerte push către owner prin **Wingo Notifications**
(<https://notifications.wingo.ro/integration.md>). Scop: să nu rămânem fără
credite (generările s-ar opri) și să aflăm imediat dacă API-ul Suno e căzut, ca
să putem anunța clienții de o eventuală întârziere.

## Ce face

Un cron rulează **în fiecare minut** și citește soldul:
`GET https://api.sunoapi.org/api/v1/generate/credit` → `{ code, msg, data: <număr credite> }`.

Pe baza răspunsului decide (anti-spam):

| Situație | Alertă Wingo | Re-alertă |
|---|---|---|
| Credite **sub prag** (default 100) | O singură dată la intrarea sub prag | DOAR când soldul **scade și mai mult** decât ultima sumă alertată |
| Sold revenit **peste prag** | — | resetează ciclul (o viitoare scădere re-alertează) |
| API **nu răspunde** corect (fără răspuns / non-200 / body invalid) | O singură dată după **2 verificări consecutive** eșuate (filtrează blip-urile) | — (rămâne „căzut" fără spam) |
| API **revine** după o cădere | Mesaj „✅ Suno API a revenit" (prioritate normală) | — |

**Anti-spam garantat**: starea (`suno_credit_monitor_state`, un singur rând) ține
minte ce s-a alertat deja. Persistă în DB → un **deploy/restart NU re-declanșează**
alertele deja trimise.

## Componente (apps/api)

- `modules/suno/suno-credit-monitor.entity.ts` — starea singleton (ultimul sold,
  ce s-a alertat, eșecuri consecutive, flag API căzut).
- `modules/suno/suno-credit-monitor.service.ts` — cron `* * * * *` + logica de
  decizie. Reutilizează `SunoProvider.getCredits()` (întoarce `number | null`;
  `null` = API căzut/eroare).
- `modules/suno/wingo-notify.service.ts` — client Wingo
  (`POST /api/v1/notify/send`, header `X-API-Key`). Graceful: nu aruncă niciodată.
- `modules/suno/suno-credits.controller.ts` — endpoint-uri admin (vezi mai jos).

## Setări (admin `/settings`)

| Cheie | Default | Rol |
|---|---|---|
| `SUNO_CREDIT_MONITOR_ENABLED` | ON | Master switch cron. Oprește cu `false`/`0`. |
| `SUNO_CREDIT_ALERT_THRESHOLD` | `100` | Pragul „credite scăzute". |
| `WINGO_API_KEY` | (env) | Cheia Wingo (64 hex). Secret, criptat în DB. |
| `WINGO_NOTIFY_URL` | `https://notifications.wingo.ro/api/v1/notify/send` | Endpoint send (override opțional). |

`WINGO_API_KEY` e setat în `/home/manele/.env` pe prod (fallback env; poate fi
și rotit din admin `/settings` → secțiunea „Wingo").

## Endpoint-uri admin

```
GET  /api/admin/suno-credits        # starea curentă + wingoConfigured
POST /api/admin/suno-credits/check  # forțează o verificare acum (poate alerta)
POST /api/admin/suno-credits/test   # trimite o notificare de test pe Wingo
```

## Verificare

```bash
# stare + sold curent
deploy/prod.sh psql 'SELECT "lastCredits", "lastCheckedAt", "lowAlertActive", "lowAlertCredits", "apiDown", "consecutiveFailures" FROM suno_credit_monitor_state'

# logurile cron-ului
deploy/prod.sh logs api 300   # caută [SunoCreditMonitor]
```

## Note

- Mesajele de alertă sunt în română (le citește owner-ul), prioritate `high`
  pentru credite scăzute / API căzut, `normal` pentru recovery.
- Pragul „2 eșecuri consecutive" pentru API căzut e o constantă în
  `suno-credit-monitor.service.ts` (`FAILS_BEFORE_DOWN`).
- Partea de a anunța clienții despre o eroare Suno se face manual (nu e
  automatizată) — owner-ul primește alerta și intervine.
