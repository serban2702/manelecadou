VPS=VPSIonos
REMOTE=/home/manele

.PHONY: deploy deploy-api deploy-web deploy-admin deploy-ops ssh logs logs-api logs-web logs-admin logs-caddy logs-ops logs-file logs-429 backup rollback restart status \
        deploy-coolify coolify-domains

deploy:
	@echo "→ git push + remote deploy (full)"
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh full"

deploy-api:
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh api"

deploy-web:
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh web"

deploy-admin:
	@git push origin main
	@ssh $(VPS) "cd $(REMOTE) && ./deploy.sh admin"

deploy-ops:
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
# Coolify face build-ul și restartul singur. Dacă „Auto Deploy" e pornit pe
# resursă, `git push` e tot ce trebuie — target-urile de mai jos sunt pentru
# când vrei să forțezi din terminal.
#
#   COOLIFY_URL=https://coolify.exemplu.ro
#   COOLIFY_TOKEN=...            (Coolify → Keys & Tokens → API tokens)
#   COOLIFY_RESOURCE_UUID=...    (din URL-ul resursei)

deploy-coolify:
	@git push origin main
	@if [ -n "$$COOLIFY_TOKEN" ]; then \
		./deploy/coolify-deploy.sh; \
	else \
		echo "→ push făcut. Coolify preia de aici (sau apasă Deploy în UI)."; \
		echo "  Pentru deploy forțat din terminal, setează COOLIFY_URL/TOKEN/RESOURCE_UUID."; \
	fi

# Lista de domenii pentru câmpul „Domains" al serviciului `router`.
coolify-domains:
	@echo "Rulează în containerul api al stack-ului:"
	@echo "  docker compose -f docker-compose.coolify.yml exec api node scripts/coolify-domains.mjs"
