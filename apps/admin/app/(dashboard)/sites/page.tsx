// Rută Next dedicată DOAR pentru direct-load/refresh la /sites. Re-exportăm
// catch-all-ul (nu _content) ca view-ul să se aleagă după pathname — altfel, după
// un refresh aici, navigarea SPA către alte pagini rămânea blocată pe Sites
// (Next ținea montată pagina dedicată, pushState nu re-rulează match-ul de rută).
export { default } from '../[[...slug]]/page';
