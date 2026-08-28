/**
 * Unde e permis login-ul.
 *
 * Pe site-urile publice nu există cont de client: vizitatorul își regăsește
 * comenzile prin identitatea de vizitator („Manelele mele") și prin linkul
 * direct din emailul de livrare. Login-ul rămâne doar în admin.
 *
 * Regula e aceeași cu cea după care routerul decide ce aplicație servește
 * (`deploy/router/nginx.conf`: `server_name ~^admin\.`, plus `Caddyfile` pe
 * stack-ul vechi): host-ul din `ADMIN_URL`, sau orice host care începe cu
 * `admin.`. Ținând-o identică, „unde se servește admin-ul" și „unde se poate
 * face login" nu pot să divergă.
 *
 * Comparația e pe host-ul COMPLET, cu port — nu pe hostname. În dev site-ul e
 * `localhost:1500` iar admin-ul `localhost:1505`: pe hostname ar fi ieșit egale
 * și login-ul ar fi rămas deschis pe site-ul public exact în mediul în care
 * testăm că e închis.
 */
export function isAdminHost(requestHost: string | null | undefined, adminUrl: string | undefined): boolean {
  if (!requestHost) return false;
  const host = requestHost.toLowerCase().trim();
  if (!host) return false;
  if (host.split(':')[0].startsWith('admin.')) return true;
  if (!adminUrl) return false;
  try {
    return host === new URL(adminUrl).host.toLowerCase();
  } catch {
    return false;
  }
}
