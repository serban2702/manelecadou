VPS=VPSIonos
REMOTE=/home/manele

# Stack nou (Nginx Proxy Manager + R2). Setează-le când serverul e gata:
#   make deploy-new VPS_NEW=user@ip
VPS_NEW?=
REMOTE_NEW?=/home/manele

.PHONY: deploy deploy-api deploy-web deploy-admin deploy-ops ssh logs logs-api logs-web logs-admin logs-caddy logs-ops logs-file logs-429 backup rollback restart status \
        deploy-new deploy-new-api deploy-new-web deploy-new-admin deploy-new-router logs-new status-new

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

# --- Stack nou (docker-compose.coolify.yml, în spatele Nginx Proxy Manager) ---
# `deploy/deploy.sh` e în repo, deci se actualizează singur cu git pull.

define REQUIRE_VPS_NEW
	@if [ -z "$(VPS_NEW)" ]; then echo "Setează VPS_NEW=user@ip (sau un alias din ~/.ssh/config)"; exit 1; fi
endef

deploy-new:
	$(REQUIRE_VPS_NEW)
	@git push origin main
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && ./deploy/deploy.sh full"

deploy-new-api:
	$(REQUIRE_VPS_NEW)
	@git push origin main
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && ./deploy/deploy.sh api"

deploy-new-web:
	$(REQUIRE_VPS_NEW)
	@git push origin main
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && ./deploy/deploy.sh web"

deploy-new-admin:
	$(REQUIRE_VPS_NEW)
	@git push origin main
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && ./deploy/deploy.sh admin"

logs-new:
	$(REQUIRE_VPS_NEW)
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && docker compose -f docker-compose.coolify.yml logs -f --tail=100"

status-new:
	$(REQUIRE_VPS_NEW)
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && docker compose -f docker-compose.coolify.yml ps"

deploy-new-router:
	$(REQUIRE_VPS_NEW)
	@git push origin main
	@ssh $(VPS_NEW) "cd $(REMOTE_NEW) && ./deploy/deploy.sh router"
