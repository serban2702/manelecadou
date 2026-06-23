# 08 — Chestionar de onboarding (întrebările agentului înainte de cod)

> Lista completă de întrebări pe care agentul de cod trebuie să mi le pună **înainte să scrie o linie de cod**, pentru un proiect nou. Grupate pe domenii. Agentul le adaptează (sare peste cele evidente din design), dar acoperă fiecare zonă. Pentru fiecare integrare externă, agentul îmi spune și **de unde iau cheia** și **ce scope** trebuie.

---

## A. Produs & brand
1. Numele proiectului + domeniul principal (`<proiect>.ro`)?
2. Ce produs generează (muzică / video / imagine / text / voce / altceva)? Descriere scurtă a livrabilului.
3. Tagline, ton de brand, paletă de culori, logo, OG image, favicon? (Vin din design-ul Claude Design — confirm.)
4. Pe ce piață/limbi? Câte limbi în site (ex. ro / ro+en / ro+en+de+es / 8 limbi)? Una default.

## B. Provideri AI & generare
5. Ce provider(i) AI pentru generare? (ex. Suno pentru audio; OpenAI/Grok pentru text/lyrics; Veo / Sora / Kling / Runway pentru video; ElevenLabs/TTS pentru voce; modele image-to-video.) Care model exact?
6. Pentru fiecare provider: cheia API (de unde o iau) + base URL + parametri (model, timeout, retries) + cost per unitate (pentru tracking).
7. Pipeline-ul: e nevoie de un pas intermediar (ex. lyrics → validare → audio)? Generarea e sincronă sau async cu polling?
8. Câte variante întoarce produsul (clientul alege una)? Există add-on-uri (variante extra, video-collage, duet, extended, QR)?
9. Există preview gratuit înainte de plată (ex. versuri / clip scurt)? Sau totul după plată?

## C. Wizard & flux
10. Care sunt **pașii concreți** ai wizardului, în ordine? (ex. ocazie → poveste/destinatar → stil → voce → add-on-uri → [poze] → plată.)
11. Ce câmpuri colectează fiecare pas? Care sunt obligatorii?
12. Există pași condiționați (apar doar la anumite selecții)?
13. E wizard clasic, sau alt tip de checkout (ex. o singură pagină, upload + plată)? Dacă nu e wizard, cum arată funnel-ul?

## D. Identitate client & livrare
14. Comanda se identifică pe **email**, **telefon**, sau ambele? Care e obligatoriu?
15. Cum se livrează produsul: email, SMS, WhatsApp, pagină cu link, QR? (Determină dacă am nevoie de Twilio.)
16. Userii își fac cont (Better Auth pe frontend) sau totul pe guest sessions? Login pe frontend = rar — confirm dacă acest proiect îl are.

## E. Prețuri & plată
17. Pachete și prețuri (basic/plus/premium etc.), valută?
18. Cont Stripe dedicat acestui proiect — confirm că pot crea endpoint webhook `https://api.<proiect>.ro/stripe/webhook` (test apoi live). Îmi dai cheile sau le pun eu?
19. Reduceri / coduri promo / roată norocului? Recovery pentru coș abandonat (emailuri/SMS escaladate cu reduceri) — activ?
20. Facturare SmartBill (RO/B2B)? Dacă da, datele firmei.

## F. Chat & agent AI (vezi `05`)
21. Proiectul are chat? Dacă da, ce **direcție**: fără AI / asistent info-only / agent de vânzări complet?
22. Agentul poate comanda din chat? Poate trimite linkuri de plată (cu aprobare admin sau auto)? Poate genera/modifica produsul?
23. Pornesc pe `suggest` (eu aprob) sau `auto`? Persona agentului (nume, ton)?
24. Inbox unificat cu email/SMS, sau doar chat web?

## G. Analytics, pixeli & ads (vezi `04`)
25. Ce pixeli: GA4, Meta, TikTok, Google Ads? ID-urile (de unde le iau).
26. CAPI server-side: Meta access token + test event code; TikTok token. (Events Manager / TikTok Events.)
27. Vreau dashboard de spend vs revenue (ROAS)? Pe ce platforme trag spend-ul (Meta/Google/TikTok Marketing API)?
28. OpenReplay: confirm că-l conectez la instanța self-hosted comună (project key nou). Branding overlay (culori dialog remote-control)?
29. Consent gate real sau pixeli din prima secundă (default: din prima secundă)?

## H. Email & notificări
30. Provider email: Mailgun / Brevo / SMTP? Domeniul de trimitere + DNS (SPF/DKIM/DMARC) configurat?
31. Web push admin (VAPID) la mesaj/comandă nouă — activ?
32. Newsletter / campanii marketing — activ?

## I. Infrastructură & deployment (vezi `06`)
33. Ce **prefix de port** alocăm (ex. 42)? (Verific să nu fie folosit — 49=Melodia Ta.)
34. Pe ce VPS deploy (Hetzner comun / alt server)? Acces SSH (alias, cheie, user, OS)?
35. Sub-domeniul de admin (non-evident — ex. interior/studio/panel/regie)?
36. NPM partajat — confirm rețeaua externă + că pot crea Proxy Hosts (sau le fac eu din UI)?
37. Cloudflare — token scoped pe zonă (Zone.DNS:Edit, Zone:Read)?
38. Deploy prin **GHCR** (build pe Mac, push imagini) sau **rsync + build pe server**?
39. Storage: GCS real (bucket + service account) sau emulator? Unde stau fișierele generate în prod?

## J. Operare & echipă
40. Cine sunt adminii (emailuri pentru conturile Better Auth + roluri owner/admin/support)?
41. Emailuri pentru alerte (escaladări AI, generări blocate, plăți eșuate)?
42. Skill-urile Claude standard de inclus (vezi `09`) — toate sau un subset?

---

## Cum răspund
Pot răspunde pe rând sau într-un singur mesaj. Agentul **nu pornește scaffolding-ul** până nu are minim: produs + provideri AI + pași wizard + prețuri + identitate client (email/telefon) + direcția de chat + prefix de port + acces deploy. Restul se poate clarifica pe parcurs, dar agentul le marchează ca decizii deschise, nu le presupune tacit.
