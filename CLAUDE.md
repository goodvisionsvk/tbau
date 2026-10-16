# CLAUDE.md — pracovný kontext projektu TBAU portál

> **⚠️ DÔLEŽITÉ — po KAŽDEJ dokončenej úlohe aktualizuj OBA súbory:**
>
> 1. **`CLAUDE.md`** (tento súbor) — doplň nové/zmenené informácie potrebné pri ďalšej
>    práci (nové moduly, zmeny nasadenia, cesty, príkazy, rozhodnutia).
> 2. **`README.md`** — vždy aktualizuj **denník prác** + sekcie **Bezpečnosť** a
>    **ISO 27000** (čo pribudlo hotové, čo ešte treba dorobiť) + popis/stav modulov.
>
> Potom **commit + push do `main`** a nasadenie na VPS.
> Cieľ: aby mal ktokoľvek (aj nová session) vždy aktuálny a úplný kontext.
> **Tajomstvá sem NEPÍŠ** (heslá, kľúče, SESSION_SECRET) — súbor je v gite.

---

## Čo je projekt

Firemný portál pre stavebnú firmu **TBAU, s. r. o.** (Žilina). Modulárna platforma,
ktorá postupne automatizuje firemné procesy. Rozloženie: logo hore, menu vľavo.

- **Naživo:** https://portal.tbau.eu (primárna doména; `tbau.goodvision.sk` ostáva ako záloha)
- **Repo:** https://github.com/goodvisionsvk/tbau (privátne, branch `main`)
- Podrobný popis, moduly, bezpečnosť a ISO stav sú v [README.md](README.md).

## Technológie

Node.js + Express, EJS (server-side rendering), SQLite (better-sqlite3),
express-session (+ bcrypt), helmet, morgan. Prevádzka: systemd + nginx + Let's Encrypt.

Pozn.: server má **Node 26** → `better-sqlite3` musí byť **v13+** (v11 sa nekompiluje).

## Štruktúra kódu

```
server.js         – vstupný bod (Express, middleware, routy)
src/config.js     – konfigurácia z .env (DB_PATH, UPLOADS_DIR, ...)
src/constants.js  – firemné údaje + roly + buildNav(user) (role-aware menu)
src/permissions.js– oprávnenia (isFullAccess, foremanProjectIds, canAccessProject, ...)
src/util/dates.js – ISO týždne a dátumy (weekDates, monthRange, ...)
src/upload.js     – multer (upload smenoviek do data/uploads/smenovky)
src/icons.js      – líniové SVG ikony (icon(name,size)); v šablónach <%- icon('home',18) %>
src/db/           – index.js (schéma), seed.js, create-user.js
src/middleware/   – auth.js (requireAuth/FullAccess/Staff), csrf.js
src/routes/       – auth, pages, users, apps, projects, tasks, tests,
                    employees, attendance, myattendance, requests, reports,
                    customers (Zákazníci), inquiries (Dopyty/CRM), work
views/            – EJS (layouts/app.ejs = sidebar, layouts/public.ejs = login/landing)
public/           – css/style.css, js/app.js, img/logo.png
deploy/           – tbau-portal.service, nginx-tbau.conf, deploy.sh
```

Dátový model (SQLite): `users`, `apps`, `projects` (= stavby), `tasks`,
`employees` (zamestnanci), `site_members` (priradenie na stavbu + parťák),
`shift_sheets` (smenovky – dokumenty), `attendance` (denné hodiny),
`change_requests` (žiadosti o zmenu), `work_log` (evidencia práce na projekte: čas, tokeny)
(+ `sessions` spravuje store).
Obchod: `customers` (nemecké firmy – stav, typ práce, cena/h, min. skupina, platobná
lehota/disciplína, hodnotenie, zdroj, fakturačné údaje, `active`), `contacts` (kontakty
zákazníka – meno, rola, email/telefón, `is_primary`), `inquiries` (dopyty – zákazník,
profesia, voľní od, cena, referencie, správa, stav) a `inquiry_employees` (M:N dopyt ↔
ponúkaní zamestnanci).

**Modul Obchod** (menu skupina „Obchod", len plný prístup): **Zákazníci** (`/zakaznici`,
`src/routes/customers.js`, pohľady `customers.ejs` / `customer-new.ejs` / `customer-detail.ejs`)
= CRUD firiem + kontakty + archivácia/zmazanie, filter podľa stavu/hľadania. **Dopyty/CRM**
(`/dopyty`, `src/routes/inquiries.js`, pohľady `inquiries.ejs` / `inquiry-new.ejs` /
`inquiry-detail.ejs`): `availableEmployees()` vráti aktívnych zamestnancov s odhadom „voľný od
KW" (z MAX `kw_do` ich stavby). `emailDraft()` generuje **nemecký** e-mail (podľa reálnej šablóny
obchodníka: zoznam pracovníkov – krstné meno + DE profesia + „Deutschkenntnisse …", veta o Bereiche,
dostupnosť, ponuka referencie/podkladov, podpis prihláseného obchodníka + pätička firmy). Preklad
SK→DE a riadok pracovníka = `src/util/trades-de.js` (`tradeDe`, `workerLine`, `bereicheFrom`).
Na detaile je **predmet aj text editovateľný** a odošle sa upravený (`POST /dopyty/:id/send` cez SMTP,
status→`sent`; fallback `mailto`). Zamestnanec má pole `german_level` (`constants.germanLevels`),
druhy robotníka rozšírené o Debniar/Žeriavnik (DE: Schalungsbauer/Kranführer). Enumy v `src/constants.js`.
Smer „zákazník → požiadavka" zatiaľ nie je (plán).

**Majetok spoločnosti → Vozidlá** (`/vozidla`, `src/routes/vehicles.js`, pohľady `vehicles.ejs` /
`vehicle-new.ejs` / `vehicle-detail.ejs`): register vozidiel (`vehicles`: code, name, spz, vin,
vehicle_type, seats, year, holder_employee_id→vodič, project_id→stavba, note, active) + **doklady**
(`vehicle_documents`: doc_type, file_path, valid_until, note; upload `upload.uploadVehicleDoc` do
`data/uploads/vehicles`, servírované chránene cez `/vozidla/:id/doklad/:docId/subor`). Číselníky
`constants.vehicleTypes` / `vehicleDocTypes`. Menu: skupina **Firma** (predtým Projekty) = Stavby +
**Majetok** (`/majetok` rozcestník, `active:'assets'`, `views/assets.ejs`). Platnosť dokladu po
expirácii = červený pill. Predregistrovaných 9 kódov vozidiel z TBAU360 (T002…T013).

**Import reálnych dát z TBAU360** (`scripts/import-tbau360.js`): jednorazový idempotentný import
zákazníkov (+kontaktov), stavieb a pracovníkov z prototypu Tomáša do `customers`/`contacts`/`projects`/
`employees`. Dedup podľa mena (LOWER). **Dáta NIE sú v gite** (dôverné) – JSON `{customers,sites,workers}`
sa dodáva argumentom (`node scripts/import-tbau360.js <json>`), na server sa scp-ne do `/tmp` a po
importe zmaže. Stavba sa viaže na zákazníka cez textové `projects.client` (projects nemá customer_id).
Zdroj dát = `TBAU360_prototyp_v33.html` (viď memory [[tbau360-prototyp]]): premenné `C` (zákazníci),
`XD.firms` (databáza firiem), `ST` (stavby), `W` (pracovníci cez `mkW`). Prvý import 16.10.2026:
189 zák. / 183 kont. / 9 stavieb / 47 prac.

**Referenčné stavby** (`/referencie`, `src/routes/references.js`, pohľady `references.ejs` /
`reference-new.ejs` / `reference-detail.ejs`): portfólio stavieb + fotky (upload cez
`upload.uploadRefImages` do `data/uploads/references`, servírované chránene cez
`/referencie/:id/foto/:imgId`). Tabuľky `reference_sites`, `reference_images`. V dopyte sa referencie
vyberú (`inquiry_references`) → popis ide do e-mailu (blok „Referenzprojekte") a **fotky sa pripoja
ako prílohy** (`buildInquiryView` zostaví `attachments`, `mailer.sendMail` ich pošle). Výber sa dá
meniť aj na detaile dopytu (`POST /dopyty/:id/references`).

**Vykázaná práca** (`/praca`, len full access, v Nastaveniach): čas + tokeny + odhadovaná cena
práce (`work_log`). Sadzba `constants.workHourlyRate` (**40 €/h**, reálny spoločný čas); cena =
hodiny × sadzba. **Čas aj tokeny Claude Code sessions = automaticky**: **SessionEnd hook**
(`scripts/log-session-tokens.js`) z transkriptu sčíta tokeny a vypočíta reálny spoločný čas
(súčet medzier medzi správami, každá medzera obmedzená na 20 min, aby sa nerátali prestávky),
a pošle `hours`+`tokens` na chránený endpoint `POST /api/worklog` (hlavička `X-Worklog-Secret`,
mountnutý PRED session/csrf). Stretnutia a staršie míľniky sú manuálne (seed). Secret: lokálne
`.worklog-secret` (gitignored) = server `.env` `WORKLOG_SECRET`. Upsert podľa `work_log.session_ref`
(bez duplicít). Hook je v `.claude/settings.local.json` (aktívny od najbližšej session).
Tokeny = nové tokeny (input+output+cache_creation, **bez** cache re-readov). Stránka `/praca` má
2 sekcie: **Rozpis vykonaných prác** (klientske položky, `hours=0, session_ref NULL`) a **Čas a
náklady** (účtované: stretnutia + auto sessions + prípadné odpočty so zápornými hodinami).
**Čas vývoja internej evidencie sa neúčtuje** (záporný záznam „Neúčtovaná réžia…").

**Zamestnanci** (`/zamestnanci`): tabuľka s **filtrami** (hľadanie, stavba, pozícia, druh robotníka,
archivovaní) + tlačidlo „Pridať" → samostatná stránka `/zamestnanci/novy`. Akcie: Upraviť
(`/zamestnanci/:id`), **Archivovať** (`/:id/archive`, soft = `active=0`), **Zmazať** (`/:id/delete`,
hard, kaskáda na dochádzku/priradenia). Tabuľka má stĺpce Pozícia, Druh robotníka, Stavba.

**Stavby** (`/projects`): rovnaký vzor – tabuľka + **filter** (hľadanie, stav) + „Pridať" →
`/projects/novy`; detail `/projects/:id` = **editovateľné parametre** (podľa zadania klienta:
názov, kód, zákazník, adresa, **KW od/do, Bauleiter, Polier**, stav, rozpočet, dátumy, poznámka;
počet ľudí z turnusu zatiaľ 0) + ľudia na stavbe + smenovky. Stavy v `constants.projectStatuses`
(planned/active/paused/done = Plánovaná/Prebieha/Pozastavená/Ukončená). Nové stĺpce projects:
`bauleiter, polier, kw_od, kw_do`. Stavba môže byť naša aj pre klienta (CRM prepojenie neskôr).

**Bezpečnosť hesiel a prihlasovania** (`src/util/password.js`, `src/routes/auth.js`,
`src/middleware/auth.js`): politika sily hesla `password.validate(pw,{email})` (min. 10 znakov,
malé+veľké písmeno, číslica, nesmie obsahovať e-mail; pravidlá = `password.RULES`). **Vynútená
obmena 1×/rok**: `users.password_changed_at` + `password.isExpired()`; `passwordChangeReason(user)`
vráti `forced` (dočasné heslo/reset = `must_change_password`) / `expired` (>365 dní) / null a
`requireAuth` podľa toho presmeruje na `/account/password`. **Remember-me**: checkbox na logine →
`req.session.cookie.maxAge = 30d`. **Zabudnuté heslo** `/forgot` → zápis do `password_reset_requests`
(open|done), admin vybaví v `/users` (`/users/reset-request/:id/resolve|dismiss`) – bez SMTP, heslo
odovzdá mimo systému; neprezrádza existenciu konta. **Blokovanie**: `users.active=0` (login to kontroluje),
v `/users` tlačidlo Zablokovať/Odblokovať (`/users/:id/toggle`). Nová tabuľka `password_reset_requests`.

**Roly** (users.role): `sef` + `admin` = plný prístup; `parcak` = svoje stavby a ľudia;
`zamestnanec` = len vlastná dochádzka + žiadosti. Prepojenie prihlásenia na zamestnanca:
`employees.user_id`. Dochádzka = **denné** hodiny (týždenná mriežka), report sčíta za mesiac.

**Dochádzka – pohľady:** `/dochadzka?view=week` = editovateľná týždenná mriežka (Po–Ne) + smenovky;
`view=month` = read-only prehľad celého mesiaca (zamestnanci × dni). Obidva filtrované podľa **stavby**.
**Reporty** (`/reporty`) majú filter podľa stavby; **export pre mzdy je vždy mesačný** CSV
(`/reporty/export?year&month&project`). Karty aplikácií vedú na modul cez `constants.appRoutes`
(napr. `dochadzka → /dochadzka`); nové moduly tam pridaj.

**HR pozície** (`employees.position`, odlišné od prihlasovacej `users.role`): majitel, obchodnik,
uctovnik, majster, robotnik; pri robotníkovi aj **druh** (`employees.trade`, napr. Murár, Tesár,
Zateplovač…). Číselníky v `constants.employeePositions` / `constants.workerTrades`.

**Menu je zoskupené** (`constants.buildNav` vracia skupiny `{label, items}`): **HR** (Zamestnanci,
Dochádzka, Report dochádzky, Žiadosti), **Projekty** (Stavby), **Systém** (Nastavenia). Hlavičky
skupín = `.nav-group`. Zamestnanec vidí len Moja dochádzka.

**Menu (Nastavenia):** sekcie Používatelia, Aplikácie, Úlohy, Testy sú zoskupené pod položkou
**Nastavenia** (`/nastavenia`, rozcestník `views/settings.ejs`, len plný prístup). Tieto routy
(`/users`, `/apps`, `/tasks`, `/tests`) sú chránené `requireAdmin` (= plný prístup) a nastavujú
`active: 'settings'`.

Nahraté smenovky (JPG/PNG/PDF) sú mimo gitu v `data/uploads/` a servírujú sa chránene
cez `/dochadzka/smenovka/:id/subor` (kontrola prístupu k stavbe).

**Zálohovanie** (`scripts/backup-db.js`, `deploy/tbau-backup.{service,timer}`, `deploy/BACKUP.md`):
denná konzistentná záloha DB (better-sqlite3 online `.backup()` + gzip + rotácia `BACKUP_KEEP`=30)
do `backups/` (mimo gitu) cez systemd timer o 02:30. NAS Synology si zálohy + `data/uploads/`
**prírastkovo ťahá z VPS** (rsync/Hyper Backup, read-only účet `backup`). Stav poslednej zálohy
ukazuje `/nastavenia` (funkcia `backupStatus()` v `pages.js`, odsek v `views/settings.ejs`).
Inštalácia timera na serveri podľa `deploy/BACKUP.md` (nie je súčasťou `deploy.sh`).

Health check: `GET /health` (verejný, server + DB) — používa ho sekcia **Testy** a je vhodný aj na monitoring.
**Testy** (`/tests`, `src/routes/tests.js`, 8 testov): „Stránka funguje" (self /health), **CRUD
zamestnanca/stavby**, **Politika hesla**, **Expirácia hesla**, **Prihlásenie a zmena hesla**,
**Žiadosť o reset**, **SMTP e-mail**. DB testy bežia v transakcii s `ROLLBACK` (nič neostane);
logické testy cez `logicTest()`. Nové testy pridávaj sem.

**SMTP / e-mail** (`src/mailer.js`, nodemailer): `isConfigured()`, `verify()`,
`sendMail({to,subject,text,html})`. Konfigurácia sa číta **dynamicky z DB** cez `settings-store.js`
(`getSmtp()`) – tabuľka `app_settings` (kľúč–hodnota), s fallbackom na `.env` (`config.smtp`).
**Edituje sa priamo v portáli**: Nastavenia → **E-mail (SMTP)** (`/nastavenia/smtp`, `views/smtp.ejs`):
host, port, SSL/TLS, používateľ, heslo (ukladá sa len ak je zadané), odosielateľ + **tlačidlo
„Poslať testovací e-mail"** (`POST /nastavenia/smtp/test` pošle na e-mail prihláseného). Kľúče v
`app_settings`: `smtp_host/port/secure/user/pass/from`. Napojené: **Dopyty** `POST /dopyty/:id/send`
(pošle ponuku na hlavný e-mail kontaktu, status `sent`; tlačidlo len ak `smtpReady`), **žiadosti
o reset** `notifyAdminsAboutReset()` v `auth.js`. Websupport TBAU: `smtp.m1.websupport.sk:465` SSL,
schránka `notifikacie@tbau.eu`. `settings-store.set(key,val)`/`get(key,fallback)` je všeobecné úložisko nastavení.

## Klientov CRM (TBAU 360 – modul Obchod)

Klient (Tomáš Kuriak) dodal **zadanie + klikací prototyp** (žiadny backend, len demo dáta).
Uložené v `reference/` (`ZADANIE_CRM.md`, `crm-prototype.html`) – **nemeniť**, je to zdroj pravdy
pre vzhľad a správanie CRM.

- **Biznis model:** TBAU zháňa robotníkov zo SK a ponúka ich **nemeckým firmám**, ktoré robia
  zákazky. CRM reťaz: `Zákazník (DE firma) → Stavba → Požiadavka (koľko ľudí, profesia, KW od–do)`.
- **Rozhodnutia:** (1) jeho prototyp sa do portálu **nevkladá** (route `/crm-prototyp` bola na
  žiadosť používateľa odstránená); jeho appku pozeráme **samostatne** z `reference/` (lokálny
  náhľad: kópia s `<meta charset="utf-8">` servírovaná napr. `python3 -m http.server` – originál
  v `reference/` nemeniť). Staviame **našu integrovanú** verziu modulu Obchod.
  (2) jeho **dizajn preberáme na celý portál** (oranžový `#C2410C`, bridlicový nav `#1B2830`,
  fonty Barlow Semi Condensed + Source Sans 3, svetlý/tmavý režim) – HOTOVO.
- **Stavby sú zjednotené:** `projects` (naša „stavba") môže byť samostatná (naša) alebo naviazaná
  na CRM zákazníka (nemecká stavba). Plán: `projects.customer_id` (nepovinné).
- **Zamestnanci:** jeho prototyp **nemá** sekciu zamestnancov ani menných robotníkov – iba
  app-role (Obchodník/Koordinátor) a **počty** ľudí v požiadavkách. Menných robotníkov máme my v HR.
- **Oddelenia CRM:** Obchod, Koordinácia, Administratíva, Doprava a ubytovanie.
  **Role CRM (návrh):** Obchodník, Koordinátor, Administratíva, Vedenie.
- **Poradie stavby:** HR (zamestnanci + role) → Stavby → modul Obchod (CRM, podľa fáz v zadaní).

## Lokálny vývoj

```bash
npm install
cp .env.example .env          # doplň SESSION_SECRET: openssl rand -hex 32
npm run init-db               # DB + admin účet + seed
npm start                     # http://localhost:3000
```

Tvorba používateľa z CLI: `node src/db/create-user.js <email> "<Meno>" [admin|user]`

> Pozn.: lokálny beh vyžaduje novší Node (better-sqlite3 v13). Na Node 20 segfaultuje —
> testuj na serveri (Node 26) alebo aktualizuj lokálny Node.

## Git workflow

Používateľ chce **automaticky commitovať a pushovať priamo do `main`** a nasadiť na VPS.
Po práci: commit (po slovensky, s `Co-Authored-By: Claude ...`), `git push`, potom deploy.

## Server / prístup

| Vec | Hodnota |
|-----|---------|
| Server | TBAU-Server, Ubuntu 24.04, IP `80.211.202.23` |
| SSH (admin) | `ssh -i ~/.ssh/id_ed25519_tbau_server tbau@80.211.202.23` (sudo, key-only) |
| Adresár aplikácie | `/opt/tbau-portal` |
| systemd služba | `tbau-portal` |
| nginx konfig | `/etc/nginx/sites-available/tbau` |
| HTTPS | Let's Encrypt (certbot), auto-obnova |
| DNS | `portal.tbau.eu` A → 80.211.202.23 (tbau.eu @ websupport.sk; pozor na wildcard `*.tbau.eu`). Záloha `tbau.goodvision.sk`. HTTPS cert pokrýva obe + www. |

Užitočné príkazy na serveri (cez SSH ako `tbau`):

```bash
sudo systemctl status tbau-portal        # stav
sudo systemctl restart tbau-portal       # reštart
sudo journalctl -u tbau-portal -n 50     # logy aplikácie
sudo nginx -t && sudo systemctl reload nginx
```

## Nasadenie novej verzie

Z lokálu po pushnutí do `main`:

```bash
bash deploy/deploy.sh          # SSH na server: git pull + npm ci + reštart služby
```

Server ťahá repo cez **read-only deploy key** (`~/.ssh/id_ed25519_deploy` na serveri).
Produkčný `.env` je len na serveri v `/opt/tbau-portal/.env` (nie v gite).

## Účty

- **Portál:** `admin@tbau.sk` (admin) — heslo sa mení pri prvom prihlásení.
- **SSH server:** `tbau` (sudo). `tomas` (Tomáš Kuriak, sudo) — ✅ aktívny (kľúč nahraný).
- **SSH `nasbackup`** (uid 1003, skup. tbau): read-only účet pre zálohy na NAS Synology DS220+
  (QuickConnect `ODUTRADE`). Bez hesla, kľúč obmedzený cez `rrsync -ro /opt/tbau-portal/backups`
  (nevie shell/zápis/zvyšok servera). Súkromný kľúč je u používateľa (na NAS), nie v gite.
- Nový SSH kolega = pošle verejný `.pub`, založí sa mu vlastný účet (nikdy nezdieľať súkromné kľúče).

## Otvorené úlohy / pozor

Aktuálny zoznam je v portáli (sekcia **Úlohy**) a v `README.md`. Kľúčové:

- 🔴 Zmeniť **root heslo** servera (bolo kedysi v plaintexte).
- 🔴 SSH hardening: `PasswordAuthentication no`, `PermitRootLogin no`.
- 🔴 Nahradiť **NOPASSWD sudo** účtu `tbau` za sudo s heslom.
- 🟠 Zálohovanie DB, rate-limiting prihlásenia, monitoring.
- 🌐 Neskôr: prechod na doménu `portal.tbau.sk`.

## Dizajn / UX

- **Dizajnový systém: čistý minimalistický štýl à la Apple / macOS** (`public/css/style.css`).
  Biela + sivá, **systémové fonty** (SF Pro cez `-apple-system` stack, žiadne Google fonty),
  jemné tiene, zaoblené rohy, veľa bieleho priestoru. Akcent = systémová modrá `#0071E3`
  (dark `#0A84FF`), inak neutrálne sivé. Svetlý sidebar (macOS), aktívna položka = jemné sivé
  zvýraznenie (bez farebných pruhov). **Svetlý/tmavý režim podľa systému** (`prefers-color-scheme`
  + `data-theme`). Stavy vyjadruj **farbou aj textom** (jemné pill farby, `.pill.*`).
  Pozn.: pôvodný oranžový dizajn z prototypu sme zavrhli (používateľ chcel Apple štýl).
- **Ikony:** žiadne emoji v UI – používaj **líniové SVG** cez `src/icons.js` (`<%- icon('name',size) %>`,
  `app.locals.icon`). Menu/karty/aplikácie používajú názvy ikon (home, clock, inbox, chart, building,
  hardhat, settings, users, user, grid, tasks, beaker, receipt, file, download, save, refresh, key, calendar).
- **Mobile-first, responzívny dizajn je POVINNÝ.** Celý portál musí byť použiteľný a
  dobre vyzerať na mobile z pohľadu UX. Pri každej novej stránke/komponente over
  responzivitu na mobilnej šírke (~375 px).
- Vzory, ktoré už používame: ľavé menu = **výsuvný drawer** s hamburgerom (`.nav-toggle`,
  `public/js/app.js`), formuláre sa **stackujú** (`.form-row` auto-fit), široké tabuľky sú
  v `.table-wrap` s horizontálnym scrollom, dostatočne veľké tap-targety.
- CSP povoľuje len `script-src 'self'` → JS dávaj do `public/js/*.js` (žiadny inline `<script>`).

## Preferencie používateľa

- Komunikácia po **slovensky**.
- Bezpečnosť a súlad s **ISO 27000** sú priorita — priebežne dopĺňať do README.
- Po každej práci: aktualizovať **CLAUDE.md** aj **README.md**, commit + push, nasadiť na VPS.
