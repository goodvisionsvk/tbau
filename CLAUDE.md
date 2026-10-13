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

- **Naživo:** https://tbau.goodvision.sk (dočasná doména; neskôr `portal.tbau.sk`)
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
                    employees, attendance, myattendance, requests, reports, work
views/            – EJS (layouts/app.ejs = sidebar, layouts/public.ejs = login/landing)
public/           – css/style.css, js/app.js, img/logo.png
deploy/           – tbau-portal.service, nginx-tbau.conf, deploy.sh
```

Dátový model (SQLite): `users`, `apps`, `projects` (= stavby), `tasks`,
`employees` (zamestnanci), `site_members` (priradenie na stavbu + parťák),
`shift_sheets` (smenovky – dokumenty), `attendance` (denné hodiny),
`change_requests` (žiadosti o zmenu), `work_log` (evidencia práce na projekte: čas, tokeny)
(+ `sessions` spravuje store).

**Vykázaná práca** (`/praca`, len full access, v Nastaveniach): čas + tokeny + odhadovaná cena
práce (`work_log`). Sadzba `constants.workHourlyRate` (**40 €/h**, reálny spoločný čas); cena =
hodiny × sadzba. **Čas aj tokeny Claude Code sessions = automaticky**: **SessionEnd hook**
(`scripts/log-session-tokens.js`) z transkriptu sčíta tokeny a vypočíta reálny spoločný čas
(súčet medzier medzi správami, každá medzera obmedzená na 20 min, aby sa nerátali prestávky),
a pošle `hours`+`tokens` na chránený endpoint `POST /api/worklog` (hlavička `X-Worklog-Secret`,
mountnutý PRED session/csrf). Stretnutia a staršie míľniky sú manuálne (seed). Secret: lokálne
`.worklog-secret` (gitignored) = server `.env` `WORKLOG_SECRET`. Upsert podľa `work_log.session_ref`
(bez duplicít). Hook je v `.claude/settings.local.json` (aktívny od najbližšej session).

**Zamestnanci** (`/zamestnanci`): tabuľka s **filtrami** (hľadanie, stavba, pozícia, druh robotníka,
archivovaní) + tlačidlo „Pridať" → samostatná stránka `/zamestnanci/novy`. Akcie: Upraviť
(`/zamestnanci/:id`), **Archivovať** (`/:id/archive`, soft = `active=0`), **Zmazať** (`/:id/delete`,
hard, kaskáda na dochádzku/priradenia).

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

Health check: `GET /health` (verejný, server + DB) — používa ho sekcia **Testy** a je vhodný aj na monitoring.

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
| DNS | `tbau.goodvision.sk` A → 80.211.202.23 (spravuje websupport.sk) |

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
