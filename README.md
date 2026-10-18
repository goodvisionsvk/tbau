# TBAU – Firemný portál

Interný firemný portál pre stavebnú firmu **TBAU, s. r. o.** (Žilina). Ide o jednotnú
platformu, ktorá pod sebou združuje viacero aplikácií (modulov) pre každodenný chod
firmy a postupnú optimalizáciu procesov.

**Naživo:** https://tbau.goodvision.sk  *(dočasná doména; neskôr prechod na `portal.tbau.sk`)*

## O projekte

Cieľom je jednoduchý, prehľadný a bezpečný portál, cez ktorý firma spravuje svoju
administratívu a prevádzku na jednom mieste. Portál je navrhnutý modulárne – jednotlivé
aplikácie sa pridávajú postupne. Rozloženie: **logo hore, menu vľavo**, obsah vpravo.

### Stav modulov a sekcií

| Sekcia / modul | Popis | Stav |
|----------------|-------|------|
| Prehľad | Dashboard so štatistikami | ✅ hotové |
| Používatelia | Správa účtov (admin), role, reset hesla | ✅ hotové |
| Aplikácie | Zoznam modulov automatizujúcich procesy | ✅ hotové (rozcestník) |
| Projekty (Stavby) | Evidencia stavieb + priradenie ľudí a parťáka | ✅ základ |
| Zamestnanci | Evidencia (meno, číslo, dátum nar., tel., adresa) + prihlásenie | ✅ hotové |
| **Dochádzka** | Týždenná mriežka hodín, smenovky (dokumenty), žiadosti o zmenu | ✅ v1 |
| Reporty | Mesačný report hodín na zamestnanca + CSV export | ✅ v1 |
| Žiadosti o zmenu | Zamestnanec žiada, parťák/admin schvaľuje | ✅ v1 |
| **Obchod – Zákazníci** | Zoznam nemeckých firiem (dopytujeme ich), kontakty, parametre spolupráce | ✅ v1 |
| **Obchod – Dopyty (CRM)** | Obchodník vidí voľných ľudí, vytvorí dopyt a vygeneruje e-mail zákazníkovi | ✅ v1 |
| Úlohy | Úlohy pri budovaní portálu | ✅ základ |
| Testy | Automatické testy portálu (health, CRUD, heslá, SMTP) | ✅ 8 testov |
| Správa faktúr | Vystavovanie a evidencia faktúr | 🔲 plánované |

**Roly:** Šéf + Administratíva = plný prístup · Parťák (majster) = svoje stavby a ľudia ·
Zamestnanec = vlastná dochádzka + žiadosti o zmenu.

## Technológie

- **Backend:** Node.js + Express
- **Šablóny:** EJS (server-side rendering) + express-ejs-layouts
- **Databáza:** SQLite (better-sqlite3)
- **Auth:** express-session (session store v SQLite), heslá hashované cez bcrypt
- **Bezpečnosť:** helmet (CSP, HSTS), vlastná CSRF ochrana, morgan (audit log)
- **Prevádzka:** systemd služba + nginx (reverzný proxy) + Let's Encrypt (HTTPS)

### Spustenie lokálne

```bash
npm install
cp .env.example .env          # doplň SESSION_SECRET (openssl rand -hex 32)
npm run init-db               # vytvorí DB, admin účet a seed dáta
npm start                     # http://localhost:3000
```

### Štruktúra

```
server.js            – vstupný bod (Express, middleware, routy)
src/config.js        – konfigurácia z .env
src/constants.js     – firemné údaje + definícia menu
src/db/              – databáza, schéma, seed, CLI na tvorbu používateľov
src/middleware/      – auth (prihlásenie/role) + CSRF
src/routes/          – auth, pages, users, apps, projects, tasks
views/               – EJS šablóny (layouts, stránky)
public/              – CSS a logo
deploy/              – systemd služba, nginx konfig, deploy skript
```

### Nasadenie novej verzie

```bash
bash deploy/deploy.sh          # git pull + npm ci + reštart služby na VPS
```

## Denník prác

Sekcia, ktorá sa dopĺňa po každej pracovnej session – čo sa spravilo a čo je na rade.

- **2026-08-12** – Založené repo, prvotná štruktúra a README (popis + Bezpečnosť + ISO 27000).
- **2026-08-12** – Prístup na VPS (TBAU-Server): SSH kľúčová autentifikácia, admin účet `tbau` (sudo).
- **2026-08-23** – Vytvorený **základ portálu**: úvodná stránka, prihlásenie (session, bcrypt,
  vynútená zmena hesla), databáza (users/apps/projects/tasks), ľavé menu s kategóriami
  (Používatelia, Aplikácie, Projekty, Úlohy). Značka TBAU (logo, farby, Montserrat).
- **2026-08-23** – **Nasadenie na VPS**: systemd služba, nginx reverzný proxy, otvorený firewall
  (80/443), **HTTPS cez Let's Encrypt** (auto-obnova). Portál beží na https://tbau.goodvision.sk.
- **2026-08-24** – Pridaná sekcia **Testy** do ľavého menu + endpoint `GET /health` (server + DB).
  Prvý test „Stránka funguje" (self-check, PASS/FAIL). Overené naživo.
- **2026-08-24** – Vytvorený SSH účet `tomas` (Tomáš Kuriak) a nahraný jeho verejný kľúč. Následne mu pridané **sudo** práva (NOPASSWD).
- **2026-08-24** – **Responzívny mobile-first UX**: ľavé menu na mobile ako výsuvný drawer (hamburger), stackované karty/formuláre, úpravy pre malé displeje. Overené na 375 px.
- **2026-10-01** – **Dochádzkový modul (v1)**: roly (šéf/administratíva/parťák/zamestnanec),
  evidencia zamestnancov + prihlásenia, priradenie ľudí a parťáka na stavby, týždenná mriežka
  hodín (denné hodiny), nahrávanie smenoviek (JPG/PNG/PDF) ako dokumentov za stavbu+týždeň,
  žiadosti o zmenu (zamestnanec → parťák/admin), mesačné reporty hodín + CSV export.
  Role-aware menu. Do budúcna: automatizované načítanie smenoviek (OCR).
- **2026-10-01** – Menu sprehľadnené: Používatelia, Aplikácie, Úlohy, Testy zoskupené pod
  položku **Nastavenia** (rozcestník, len plný prístup).
- **2026-10-01** – Prehľad (dashboard) doplnený o **zoznam aplikácií** (moduly a ich stav); karty vedú na modul.
- **2026-10-13** – Štart integrácie **klientovho CRM (TBAU 360)**: jeho zadanie + prototyp uložené
  v `reference/`, prototyp sprístupnený ako referencia na `/crm-prototyp`. Rozhodnuté: jeho dizajn
  preberáme na celý portál; stavby zjednotíme (naše + pre klienta). Nasleduje redizajn + moduly HR/Obchod.
- **2026-10-13** – **Redizajn celého portálu** do štýlu klientovho prototypu: farebné tokeny
  (akcent #C2410C, bridlicový nav), fonty Barlow Semi Condensed + Source Sans 3, **svetlý/tmavý
  režim podľa systému**. Prepísaný `public/css/style.css`, zmenené fonty v layoutoch.
- **2026-10-13** – `/crm-prototyp` z portálu **odstránený** (na žiadosť). Jeho appku pozeráme
  samostatne z `reference/` (lokálny náhľad s UTF-8 kópiou). Zdrojové súbory ostávajú v `reference/`.
- **2026-10-13** – **Nový dizajn: čistý bielo-sivý štýl à la Apple/macOS** (systémové fonty SF,
  systémová modrá ako akcent, svetlý sidebar, jemné tiene, svetlý/tmavý režim). Nahradil pôvodný
  oranžový prototypový dizajn. Prepísaný `public/css/style.css`, odstránené Google fonty z layoutov.
- **2026-10-13** – Emoji ikony nahradené **líniovými SVG** (`src/icons.js`) – menu, karty, aplikácie,
  tlačidlá; čistejší vzhľad ladiaci s Apple dizajnom.
- **2026-10-13** – **HR sekcia**: menu zoskupené (HR / Projekty / Systém); k zamestnancom pridaná
  **pozícia** (Majiteľ/Obchodník/Účtovník/Majster/Robotník) a **druh robotníka** (Murár, Tesár,
  Zateplovač…). Oprava: 500 na `/login` so starou/neplatnou session.
- **2026-10-13** – Nastavenia → **Vykázaná práca** (`/praca`): evidencia času, tokenov a ceny práce.
  Sadzba **40 €/h**, čas = reálny spoločný čas (míľniky + stretnutia). **Tokeny sa počítajú
  automaticky** (SessionEnd hook → `/api/worklog`). Doteraz ~6 h / 240 €.
- **2026-10-13** – **Zamestnanci** prerobení: tabuľka + filtre (stavba, pozícia, druh robotníka,
  hľadanie, archivovaní), samostatná stránka pridania, **archivácia** aj **úplné zmazanie**.
- **2026-10-13** – Z reálnej smenovky (KW 40) vytvorená stavba **Leiblfing (DE)** / Jürgen Bau,
  5 zamestnancov a dochádzka 205 h.
- **2026-10-13** – **Stavby** prerobené (rovnako ako Zamestnanci): tabuľka + filter + samostatná
  stránka pridania + detail s **parametrami podľa zadania klienta** (KW od/do, Bauleiter, Polier,
  zákazník, stav…). Evidencia práce rozdelená na *Rozpis vykonaných prác* a *Čas a náklady*;
  automatické meranie reálneho času + tokenov (SessionEnd hook); réžia za vývoj evidencie neúčtovaná.
- **2026-10-13** – Pridané **testy CRUD** zamestnanca a stavby (v sekcii Testy; bežia v transakcii
  s rollbackom, takže nič v DB neostane). Spolu 3 automatické testy.
- **2026-10-13** – **Nová doména https://portal.tbau.eu** (A záznam → 80.211.202.23; HTTPS cert
  rozšírený; nginx obsluhuje portal.tbau.eu + redirect z HTTP). `tbau.goodvision.sk` ostáva záloha.
  Token-hook prepnutý na portal.tbau.eu. Appka je bezdoménová (relatívne URL), kód netreba meniť.
- **2026-10-01** – Dochádzka: prepínač **Týždeň/Mesiac** (týždeň editovateľný, mesiac prehľad celého mesiaca),
  filter podľa stavby; Reporty: filter podľa stavby + mesačný **export pre mzdy** (CSV).
- **2026-10-18** – **Nastavenia → O systéme** (`/nastavenia/system`): technický prehľad pre admina –
  verzia aplikácie (+ git commit), technológie, domény; kde sa čo ukladá (DB veľkosť, uploads po
  priečinkoch, nastavenia, tajomstvá); čo a kam sa zálohuje (+ stav poslednej zálohy); živé štatistiky
  (počty zákazníkov/zamestnancov/stavieb/vozidiel…); stručná bezpečnosť.
- **2026-10-18** – **NAS zálohovanie spustené + šifrovaná záloha tajomstiev**: Synology DS220+
  (úloha „BackUP pull TBAU", denne 03:30) prírastkovo ťahá zálohy + uploads z VPS (overené – prvý
  pull prebehol). `.env` (SESSION_SECRET, WORKLOG_SECRET) sa pri zálohe **šifruje GPG verejným
  kľúčom** → `backups/db/env.gpg` (na NAS); dešifruje len súkromný kľúč mimo servera/gitu. Postup
  obnovy v `deploy/BACKUP.md`.
- **2026-10-18** – **Čítanie smenoviek AI → dochádzka**: v HR pribudol **Import smenovky (AI)**
  (`/dochadzka/ai-import`): nahráš fotku → AI (Claude / Gemini, nastaviteľné v Nastavenia → AI) prečíta
  mená a hodiny → **napáruje na zamestnancov** a predvyplní týždeň → skontroluješ/opravíš → **uloží do
  dochádzky** + fotka sa uloží ako doklad (smenovka). Čítač `src/ai.js` (Claude vision aj Gemini),
  cena/tokeny sa zobrazia (Claude Sonnet 5.5 ~1 €cent/strana, ~3 s). Kľúč aj model nastaviteľné v
  portáli, kľúč šifrovaný. Fotka sa pred odoslaním zmenšuje v prehliadači (canvas). nginx proxy timeout 180 s.
- **2026-10-18** – **Navigácia preorganizovaná**: **Nastavenia** a **Zmena hesla** presunuté z ľavého
  menu do **profilového menu v hornej lište** (klik na meno používateľa → Nastavenia / Zmena hesla /
  Odhlásiť). Ľavé **skupiny menu sú teraz rozbaľovacie** (klik na HR/Obchod/Firma rozbalí/zbalí; stav
  sa pamätá, aktívna skupina je vždy otvorená).
- **2026-10-16** – **HR → Dovolenky** (`/dovolenky`): evidencia dovoleniek a neprítomností
  (typ: Dovolenka/PN/Náhradné voľno/Neplatené/OČR/Iné), obdobie od–do s **automatickým výpočtom
  pracovných dní** (Po–Pi), stav Čaká/Schválená/Zamietnutá, schvaľovanie, filtre (rok, zamestnanec,
  typ, stav) a **ročný súhrn** schválenej dovolenky na zamestnanca. Nová tabuľka `leaves`.
- **2026-10-16** – **Majetok spoločnosti → Vozidlá** (`/vozidla`): menu „Projekty" premenované na
  **Firma** (Stavby + Majetok); **Majetok** (`/majetok`) je rozcestník. Vozidlá: register (označenie,
  názov, ŠPZ, VIN, typ, miesta, rok), **pridelenie vodičovi a stavbe**, **nahrávanie dokladov**
  (STK, EK, poistka, diaľničná známka, servis…) s platnosťou „do" (po expirácii červené). Predregistrovaných
  9 kódov vozidiel z TBAU360 (ŠPZ/doklady doplní používateľ – v prototype neboli). Nové tabuľky
  `vehicles`, `vehicle_documents`.
- **2026-10-16** – **Migrácia reálnych dát z TBAU360 prototypu** (od Tomáša): naimportovaných
  **189 zákazníkov** (+183 kontaktov), **9 stavieb** (SEITZ, MAYER, NEULINGER, GROSSMANN,
  EICHENSEHER, JÄGER, Wilhelm Bauer, SWIETELSKY…) a **47 pracovníkov** do portálu (sekcie Obchod,
  Stavby, Zamestnanci). Importér `scripts/import-tbau360.js` (idempotentný, dedup podľa mena);
  **dáta sú mimo gitu** (dôverné reálne dáta firmy) – JSON sa dodáva ako argument a po importe sa maže.
- **2026-10-15** – **Referenčné stavby** (`/referencie`, Obchod): portfólio stavieb – názov, miesto,
  obdobie, čo sa robilo, popis + **nahrávanie fotiek** (JPG/PNG). Pri dopyte sa dajú referencie
  **zaškrtnúť** → ich popis sa doplní do nemeckého e-mailu a **fotky sa pripoja ako prílohy** (ako
  v reálnom e-maile). Nové tabuľky `reference_sites`, `reference_images`, `inquiry_references`.
- **2026-10-15** – **Dopyt vylepšený podľa reálneho e-mailu obchodníka**: e-mail sa generuje
  **po nemecky** (zoznam pracovníkov = krstné meno + nemecká profesia + úroveň nemčiny, veta o
  oblastiach/Bereiche, dostupnosť, ponuka referencie a podkladov, profesionálny podpis + pätička).
  Zamestnanec má nové pole **úroveň nemčiny**; druhy robotníka rozšírené o Debniar (Schalungsbauer)
  a Žeriavnik (Kranführer) + prekladová tabuľka SK→DE. Text e-mailu je **editovateľný** pred
  odoslaním. (Prílohy – fotky projektu – a smer „zákazník → požiadavka" zatiaľ nie.)
- **2026-10-14** – Úvodná (verejná) stránka sprehľadnená – len **logo, „FIREMNÝ PORTÁL" a tlačidlo
  Prihlásiť sa** (odstránený popis firmy a firemné údaje).
- **2026-10-14** – **SMTP e-mail** (`src/mailer.js`, nodemailer): odosielanie e-mailov cez firemný
  SMTP (konfigurácia v `.env`: `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`). Napojené na **Dopyty**
  (tlačidlo „Odoslať zo servera" pošle ponuku priamo zákazníkovi; inak ostáva `mailto`) a na
  **žiadosti o reset** (e-mailová notifikácia adminom). Test „SMTP e-mail" v sekcii Testy overí
  spojenie. *(Čaká na doplnenie SMTP údajov do `.env` na serveri – dovtedy portál funguje cez mailto.)*
- **2026-10-14** – **Testy rozšírené na 8**: pribudli Politika hesla, Expirácia hesla, Prihlásenie
  a zmena hesla, Žiadosť o reset, SMTP spojenie (DB testy bežia v transakcii s rollbackom).
- **2026-10-14** – Z aplikácie **odstránené moduly RSV a Objednávkový systém** (na želanie) –
  zo zoznamu aplikácií, seedu aj DB (vrátane súvisiacej úlohy). Prehľad modulov sa tým sprehľadnil.
- **2026-10-14** – **Zálohovanie dát**: denná konzistentná záloha SQLite DB (online backup +
  gzip + rotácia 30 dní) cez systemd timer `tbau-backup.timer` → `backups/` (`scripts/backup-db.js`).
  Odtiaľ prírastkové sťahovanie na **NAS Synology** (NAS ťahá z VPS cez rsync/Hyper Backup – len
  nové/zmenené súbory + uploady). Stav poslednej zálohy v **Nastavenia → Zálohovanie dát**. Návod
  a obnova: `deploy/BACKUP.md`. (Server-side hotové; nastavenie NAS je na strane Synology.)
- **2026-10-14** – **Bezpečnosť hesiel a prihlasovania**: (1) **politika sily hesla** – min. 10
  znakov, malé + veľké písmeno, číslica, nesmie obsahovať e-mail (`src/util/password.js`),
  pravidlá sa zobrazujú pri zmene; (2) **vynútená obmena hesla raz za rok** – stĺpec
  `users.password_changed_at`, po 365 dňoch portál presmeruje na zmenu hesla (ako pri dočasnom);
  (3) **„Zapamätať prihlásenie"** na logine → platnosť prihlásenia 30 dní (inak 8 h);
  (4) **samoobslužná žiadosť o reset** – „Zabudnuté heslo?" (`/forgot`) vytvorí žiadosť, admin ju
  vidí v Používateľoch a vybaví (bez SMTP – dočasné heslo odovzdá mimo systému); neprezrádza, či
  e-mail existuje; (5) admin vie **zablokovať/odblokovať prihlásenie** používateľovi (zablokovaný
  sa neprihlási). Tabuľka Používatelia má stĺpec „Heslo zmenené" a stavy aktívny/zablokovaný.
- **2026-10-13** – **Modul Obchod** (ako HR, nová skupina v menu): **Zákazníci** (`/zakaznici`) –
  zoznam nemeckých firiem, ktoré robia stavby a ktorým posielame dopyty: tabuľka + filter (stav,
  hľadanie, archivovaní), samostatná stránka pridania, detail s parametrami spolupráce (typ práce,
  cena/h, min. skupina, platobná lehota a disciplína, hodnotenie, zdroj, fakturačné údaje),
  **kontakty** (Bauleiter/Polier/schvaľovateľ hodín…) a archivácia/zmazanie. **Dopyty/CRM**
  (`/dopyty`) – obchodník vidí **voľných pracovníkov** (aktívni zamestnanci + odhad „voľný od KW"
  z konca ich stavby), vyberie koho ponúka, zadá cenu a referencie a vygeneruje sa **e-mail pre
  zákazníka** (predvyplnený text + „Otvoriť v e-maile" cez `mailto` na hlavný kontakt). Nové tabuľky
  `customers`, `contacts`, `inquiries`, `inquiry_employees`. Naseedovaných 9 demo zákazníkov
  z prototypu. Automatické odosielanie e-mailu cez SMTP doplníme neskôr (zatiaľ `mailto`).

---

## 🖥️ Prístupy na server

Produkčný VPS, na ktorom beží portál.

| Parameter | Hodnota |
|-----------|---------|
| Názov | TBAU-Server |
| IPv4 | 80.211.202.23 |
| OS | Ubuntu 24.04.4 LTS |
| Doména | tbau.goodvision.sk (A → 80.211.202.23) |

### Nasadenie portálu

| Vec | Hodnota |
|-----|---------|
| Adresár aplikácie | `/opt/tbau-portal` |
| systemd služba | `tbau-portal` (`systemctl status tbau-portal`) |
| Beží na porte | 3000 (interne), navonok cez nginx 80/443 |
| nginx konfig | `/etc/nginx/sites-available/tbau` |
| HTTPS | Let's Encrypt, auto-obnova cez certbot.timer |
| Deploy z repa | read-only deploy key (git pull) |

### Používateľské účty (server, SSH)

| Účet | Práva | Prihlásenie | Poznámka |
|------|-------|-------------|----------|
| `tbau` | sudo (admin) | SSH kľúč | Hlavný správcovský účet |
| `tomas` (Tomáš Kuriak) | sudo (admin) | SSH kľúč | ✅ aktívny |

### Účty v aplikácii (portál)

| Účet | Rola | Poznámka |
|------|------|----------|
| `admin@tbau.sk` | admin | Prvotný účet – heslo treba po prvom prihlásení zmeniť |

> SSH prihlásenie je **len cez kľúč**, každý má vlastný účet (účtovateľnosť).
> Súkromné kľúče sa nikdy nezdieľajú – zdieľa sa iba verejný `.pub` kľúč.

---

## 🔒 Bezpečnosť

Priebežne evidujeme, čo ešte treba dorobiť, aby bola aplikácia bezpečná.
Aktualizuje sa po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Zmeniť root heslo servera** – bolo zdieľané v plaintexte, treba rotovať (`passwd`).
- [ ] **Zakázať prihlásenie heslom cez SSH** – povoliť len kľúče (`PasswordAuthentication no`).
- [ ] **Obmedziť/zakázať root SSH login** – po overení admin účtu (`PermitRootLogin no`).
- [ ] **Nahradiť NOPASSWD sudo** pri účtoch `tbau` a `tomas` za sudo s heslom (aktuálne passwordless).
- [ ] **Autorizácia / role** – jemnejšie rozdelenie prístupu (admin, účtovník, zamestnanec…).
- [ ] **NAS zálohovacia úloha beží pod `root`** (Synology Plánovač) – prejsť na menej privilegovaný účet / prísnejšiu politiku.
- [ ] **Šifrovanie dát v pokoji** – citlivé údaje (osobné, mzdové) šifrované v DB.
- [ ] **Rate-limiting prihlásenia** – ochrana proti hádaniu hesla (brute-force).
- [x] **Zálohovanie** – denná automatická záloha DB + rotácia + prírastkovo na NAS Synology; postup obnovy v `deploy/BACKUP.md`. *(ostáva: jednorazové nastavenie na strane NAS)*
- [ ] **Aktualizácie závislostí** – sledovanie zraniteľností (napr. Dependabot).
- [ ] **GDPR** – spracovanie osobných údajov zamestnancov v súlade s legislatívou.
- [ ] **Monitoring/alerting** – dostupnosť a bezpečnostné udalosti.

### Hotové

- [x] **SSH kľúčová autentifikácia** – prístup na server cez kľúče (nie heslá).
- [x] **Samostatné účty s vlastným kľúčom** – účtovateľnosť.
- [x] **HTTPS/TLS** – vynútené (HTTP→HTTPS redirect), HSTS, Let's Encrypt s auto-obnovou.
- [x] **Firewall (ufw)** – povolené len SSH a 80/443.
- [x] **Hashovanie hesiel** – bcrypt (cost 12), vynútená zmena dočasného hesla.
- [x] **Politika hesiel** – min. 10 znakov, malé + veľké písmeno + číslica, heslo nesmie obsahovať e-mail.
- [x] **Pravidelná obmena hesla** – vynútená zmena po max. 1 roku (`password_changed_at`).
- [x] **Samoobslužný reset** – „Zabudnuté heslo" (žiadosť pre admina; neodhaľuje existenciu konta).
- [x] **Blokovanie prihlásenia** – admin vie deaktivovať (zablokovať) konto; zablokovaný sa neprihlási.
- [x] **Bezpečné session** – HttpOnly + Secure cookies, expirácia 8 h (voliteľne „zapamätať" 30 dní), regenerácia po prihlásení.
- [x] **Ochrana pred útokmi** – CSRF tokeny, parametrizované SQL (proti injection), CSP proti XSS.
- [x] **Správa tajomstiev** – žiadne heslá/kľúče v kóde; `.env` mimo gitu (`.gitignore`); `.env` v zálohe GPG-šifrovaný.
- [x] **Šifrovanie citlivých nastavení** – SMTP heslo a AI API kľúč sú v DB šifrované (AES-256-GCM, kľúč `SETTINGS_KEY` v `.env`).
- [x] **Limity AI nákladov** – denný limit čítaní + mesačný limit nákladov (€); kľúč sa používa len na čítanie smenoviek.
- [x] **Audit log** – logovanie požiadaviek (morgan) + systemd/journald.
- [x] **Riadenie prístupu podľa rolí** – šéf/administratíva/parťák/zamestnanec; parťák vidí len svoje stavby.
- [x] **Chránené dokumenty** – smenovky sa servírujú len s kontrolou prístupu (nie cez verejné static), mimo gitu.
- [x] **Validácia uploadov** – povolené len JPG/PNG/PDF, limit 15 MB.

---

## 📋 ISO/IEC 27000 (najmä 27001)

Kroky potrebné na zosúladenie so štandardmi radu ISO 27000 (systém riadenia informačnej
bezpečnosti – ISMS). Aktualizuje sa po každej práci na projekte.

### Čo treba dorobiť

- [ ] **Rozsah ISMS** – definovať, čo systém riadenia bezpečnosti pokrýva.
- [ ] **Analýza rizík** – identifikácia aktív, hrozieb a zraniteľností + hodnotenie.
- [ ] **Plán zvládania rizík** – opatrenia na zníženie identifikovaných rizík.
- [ ] **Politiky bezpečnosti** – smernice (heslá, prístupy, práca s dátami).
- [ ] **Bezpečnosť prevádzky (A.12)** – **zálohy hotové** (denné + NAS); ostáva **monitoring** (logovanie už je).
- [ ] **Kontinuita (A.17)** – zálohy na 2 miestach (VPS + NAS) + dokumentovaný postup obnovy *(základ hotový)*.
- [ ] **Riadenie incidentov (A.16)** – postup pri bezpečnostných incidentoch.
- [ ] **Kontinuita činností (A.17)** – plán obnovy po výpadku/havárii.
- [ ] **Súlad (A.18)** – legislatíva (GDPR) a interné pravidlá.
- [ ] **Ochrana osobných údajov zamestnancov (GDPR)** – evidujú sa dátum narodenia, adresa, telefón;
      doriešiť minimalizáciu, retenciu a prístup len pre oprávnené roly (základ prístupu podľa rolí je hotový).
- [ ] **Retencia dokumentov** – pravidlá pre uchovávanie a mazanie smenoviek.
- [ ] **Dokumentácia a záznamy** – evidencia dôkazov pre prípadný audit/certifikáciu.

### Rozpracované / hotové

- [x] **Riadenie prístupu (A.9)** – prihlasovanie, role, princíp najmenších oprávnení, účtovateľnosť *(základ)*.
- [x] **Kryptografia (A.10)** – TLS pri prenose, bcrypt pre heslá *(šifrovanie dát v pokoji ešte chýba)*.
- [x] **Bezpečnosť vývoja (A.14)** – verzionovanie (git), oddelené prostredia (lokál/produkcia), bezpečné programovacie praktiky *(základ)*.
