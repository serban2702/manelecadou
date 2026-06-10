---
name: ops-regen
description: Regenerează sau modifică o piesă din producție — voce greșită, nume/relații greșite în versuri, "fă-o mai manea", stil/instrumental nepotrivit, versuri corectate de client. Folosește când userul cere "regenerează piesa", "schimbă versurile la", "clientul vrea voce feminină", "refă maneaua lui X", "fă-o mai tristă/de petrecere".
argument-hint: "<generationId / email> <ce trebuie schimbat>"
---

# Regenerare / modificare piesă

Acoperă cazurile reale din chat: voce greșită („am ales feminină și cântă masculină"),
relații/nume greșite în versuri („Dani este tatăl, nu iubitul"), stil nepotrivit
(„ăla nu-i manea", „eu am vrut de suferință"), versuri pe care clientul le vrea altfel.

## Mediu de execuție

- **Container ops (VPS)**: API prin `api-admin`, DB prin `psql`.
- **Local (Mac)**: `ssh VPSIonos 'docker exec manele-ops-1 api-admin ...'`.

## API-ul de regenerare

`POST /api/admin/generations/<id>/regenerate` cu body `AdminRegenerateInput`:

```jsonc
{
  "target": "new_track",      // OBLIGATORIU — vezi regulile de mai jos
  "lyricsMode": "keep",       // rewrite (AI scrie din câmpuri) | keep (păstrează versurile) | custom
  "customLyrics": "...",      // doar cu lyricsMode=custom — folosite LITERAL
  "edits": {                  // toate opționale — suprascriu câmpurile comenzii
    "recipientName": "…", "dedication": "…", "message": "…",
    "style": "…", "occasion": "…", "voiceArtist": "…", "packageTier": "…"
  },
  "label": "voce feminină"    // etichetă pt variație (doar target=new_track)
}
```

Alte unelte: `POST .../reroll` (variație nouă, aceleași versuri), `POST .../retry`
(re-rulează o generare blocată/failed), `POST .../promote` (variația devine piesa
principală; `{"slot":"main","notify":true}` trimite și email clientului),
`POST .../swap-tracks` (main ↔ bonus), `GET .../variations`.

## Reguli de țintă (IMPORTANT)

- **`new_track` = default-ul tău.** Creează o variație SUB comandă, fără să atingă
  piesa livrată. Asculți, compari, apoi promovezi cu `promote` dacă e mai bună.
- **`overwrite` = DOAR cu confirmare explicită a userului** — re-rulează pe aceeași
  comandă și piesa veche DISPARE. Întreabă întotdeauna: „suprascriu piesa livrată?".
- **`new_order` = comandă nouă separată** (melodie în plus) — folosit rar, cere confirmare.

## Flow

1. **Găsește generarea** (dacă ai email, folosește /ops-client întâi):
```sql
SELECT id, status, "recipientName", style, occasion, "voiceArtist", "recipientGender",
       "dedicatorName", "packageTier", LEFT(COALESCE(lyrics, "customLyrics"), 300) AS versuri,
       "audioUrl", "createdAt"
FROM generations WHERE id = '<id>';
```
2. **Diagnostichează** ce e greșit raportat la plângerea clientului (citește versurile
   complete dacă problema e de conținut: `SELECT lyrics FROM generations WHERE id='<id>'`).
3. **Alege strategia**:
   - Voce greșită → `edits.voiceArtist` + `lyricsMode: "keep"` (versurile rămân).
   - Nume/relație greșită în versuri → corectezi TU versurile (păstrând rima/metrul)
     → `lyricsMode: "custom"` + `customLyrics`. Arată-i userului diff-ul înainte.
   - „Mai manea" / alt stil / instrumental → `edits.style` (descrie concret: „manea
     orientală, sistem live, percuție grea" etc.) + de regulă `lyricsMode: "keep"`.
   - Versuri complet noi din aceleași date → `lyricsMode: "rewrite"`.
4. **Arată userului EXACT ce vei trimite** (body-ul JSON complet) și **cere confirmare**.
5. Execută: `api-admin POST /api/admin/generations/<id>/regenerate '<json>'`.
6. **Monitorizează** până la final (generarea durează 1-3 min):
```sql
SELECT id, status, LEFT(error, 120), "audioUrl" FROM generations
WHERE id = '<idNou>' OR "parentGenerationId" = '<id>' ORDER BY "createdAt" DESC LIMIT 5;
```
7. Raportează: link audio, ce s-a schimbat, pașii următori (ascultare + `promote`
   dacă userul confirmă că varianta nouă e cea bună).

## Atenționări

- O regenerare consumă credite Suno reale — nu lansa în buclă; max 2-3 încercări
  pe o problemă, apoi escaladează la user.
- Sub 10 credite Suno afișate ≈ cont aproape gol (sunoapi.org cere sold > cost) —
  verifică în admin /suno dacă generările încep să pice cu erori de credit.
- NU promite clientului refund și NU comunica direct cu clientul — tu doar repari
  piesa; comunicarea o face omul sau Irina.
