# Routerul intern al stack-ului, cu configul COPIAT în imagine — nu montat.
#
# De ce nu bind mount: Coolify parsează compose-ul și, pentru un volum scris ca
# string (`./x.conf:/etc/nginx/conf.d/default.conf`), nu poate ști dacă sursa e
# fișier sau director, așa că presupune DIRECTOR
# (`bootstrap/helpers/shared.php`, `$isDirectory = true`). Ar crea
# `/etc/nginx/conf.d/default.conf` ca folder, iar nginx ar porni pe configul
# implicit — adică tot traficul ar cădea pe pagina de bun venit nginx.
#
# Bonus: configul ajunge versionat împreună cu imaginea, deci un rollback de
# deploy dă înapoi și regulile de rutare.
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Eșuează la build dacă am stricat configul, nu la runtime pe producție.
RUN nginx -t

EXPOSE 80
