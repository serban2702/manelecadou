// Wrapper subțire — toată logica e în _content.tsx ca să poată fi
// înregistrată în SPA-router-ul din [[...slug]]/page.tsx. Pagina asta
// există doar ca direct-load la /sites (refresh) să funcționeze.
export { default } from './_content';
