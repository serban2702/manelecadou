VPS=VPSIonos
REMOTE=/home/manele

# ⚠️ PRODUCȚIA E PE COOLIFY (OVH) din 28 august 2026. Ionos rămâne pornit ca
# plasă de siguranță, dar nu mai primește trafic — niciun domeniu nu mai arată
# spre el. Target-urile `deploy*` de mai jos deployează pe IONOS, adică pe
# nimic. Ca să nu ajungi acolo din obișnuință, cer `IONOS=1` explicit.
# Deploy-ul real: `make deploy-coolify`.
ionos-guard:
	@if [ "$$IONOS" != "1" ]; then \
		echo "STOP: acest target deployează pe Ionos, care NU mai e producția."; \
		echo "  Producția e pe Coolify → foloseste: make deploy-coolify"; \
		echo "  Dacă chiar vrei Ionos (plasa de siguranță): IONOS=1 make <target>"; \
		exit 1; \
	fi

.PHONY: ionos-guard deploy deploy-api deploy-web deploy-admin deploy-ops ssh logs logs-api logs-web logs-admin logs-caddy logs-ops logs-file logs-429 backup rollback restart status \
        deploy-coolify coolify-domains

deploy: ionos-guard
	@echo "→ git push + remote deploy (full)"
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh full"

deploy-api: ionos-guard
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh api"

deploy-web: ionos-guard
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh web"

deploy-admin: ionos-guard
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh admin"

deploy-ops: ionos-guard
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh ops"

ssh:
	@ssh $(VPS)

logs:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=100"

logs-api:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=100 api"

logs-web:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=100 web"

logs-admin:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=100 admin"

logs-caddy:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=50 caddy"

logs-ops:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml logs -f --tail=50 ops"

# Tail live al access-log-ului pino (toate request-urile, JSON lines).
logs-file:
	@ssh $(VPS) "docker exec -it manele-api-1 sh -c 'tail -f /app/logs/access.log*'"

# Doar liniile 429 din ultimele zile, agregate pe path (cele mai frecvente sus).
logs-429:
	@ssh $(VPS) "docker exec manele-api-1 sh -c \"cat /app/logs/access.log* 2>/dev/null | grep -E '\\\"status\\\":429|throttler-reject' | awk -F'\\\"path\\\":\\\"' '{print \\\$$2}' | awk -F'\\\"' '{print \\\$$1}' | sort | uniq -c | sort -rn | head -30\""

status:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml ps"

backup:
	@ssh $(VPS) "docker exec manele-postgres-1 pg_dump -U manelecadou manelecadou | gzip" > backup_$(shell date +%F-%H%M).sql.gz
	@echo "→ backup salvat local: backup_$(shell date +%F-%H%M).sql.gz"

rollback:
	@echo "Backup-uri disponibile pe VPS:"
	@ssh $(VPS) "ls -lh /backups/ 2>/dev/null | head -20"
	@echo ""
	@echo "Pentru restore: ssh $(VPS) 'gunzip -c /backups/<FILE> | docker exec -i manele-postgres-1 psql -U manelecadou manelecadou'"

restart:
	@ssh $(VPS) "cd $(REMOTE) && docker compose -f docker-compose.prod.yml restart"

# --- Stack nou pe Coolify (docker-compose.coolify.yml) ---------------------
# Coolify face build-ul și restartul singur, dar TREBUIE pornit: repo-ul e legat
# prin deploy key, deci nu există webhook în GitHub și un `git push` nu declanșează
# nimic (toate deploy-urile apar ca „Manual"). Ori apeși Actions → Deploy în UI,
# ori setezi COOLIFY_TOKEN și rulezi target-ul de mai jos.
#
#   COOLIFY_URL=https://coolify.freevox.ro
#   COOLIFY_TOKEN=...            (Coolify → Keys & Tokens → API tokens)
#   COOLIFY_RESOURCE_UUID=...    (din URL-ul resursei)

# Scriptul se descurcă în ambele cazuri: cu COOLIFY_TOKEN merge prin API și
# așteaptă verdictul, fără token pornește deploy-ul prin SSH. Makefile-ul cerea
# înainte token și, în lipsa lui, doar făcea push și anunța că n-a deployat
# nimic — adică exact capcana pe care CLAUDE.md o avertizează (§6.1).
deploy-coolify:
	@git push origin main
	@./deploy/coolify-deploy.sh

# Lista de domenii pentru câmpul „Domains" al serviciului `router`.
coolify-domains:
	@./deploy/prod.sh domains
