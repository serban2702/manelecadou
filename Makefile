VPS=VPSIonos
REMOTE=/home/manele

.PHONY: deploy deploy-api deploy-web deploy-admin ssh logs logs-api logs-web logs-admin logs-caddy backup rollback restart status

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
