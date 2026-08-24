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
src/config.js     – konfigurácia z .env
src/constants.js  – firemné údaje + definícia ľavého menu (nav)
src/db/           – index.js (schéma), seed.js, create-user.js
src/middleware/   – auth.js (prihlásenie/role), csrf.js
src/routes/       – auth, pages, users, apps, projects, tasks, tests
views/            – EJS (layouts/app.ejs = sidebar, layouts/public.ejs = login/landing)
public/           – css/style.css, img/logo.png
deploy/           – tbau-portal.service, nginx-tbau.conf, deploy.sh
```

Dátový model (SQLite): `users`, `apps`, `projects`, `tasks` (+ `sessions` spravuje store).

Health check: `GET /health` (verejný, server + DB) — používa ho sekcia **Testy** a je vhodný aj na monitoring.

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
- **SSH server:** `tbau` (sudo). `tomas` (Tomáš Kuriak, bez sudo) — 🔲 čaká na jeho verejný `.pub` kľúč.
- Nový SSH kolega = pošle verejný `.pub`, založí sa mu vlastný účet (nikdy nezdieľať súkromné kľúče).

## Otvorené úlohy / pozor

Aktuálny zoznam je v portáli (sekcia **Úlohy**) a v `README.md`. Kľúčové:

- 🔴 Zmeniť **root heslo** servera (bolo kedysi v plaintexte).
- 🔴 SSH hardening: `PasswordAuthentication no`, `PermitRootLogin no`.
- 🔴 Nahradiť **NOPASSWD sudo** účtu `tbau` za sudo s heslom.
- 🟠 Zálohovanie DB, rate-limiting prihlásenia, monitoring.
- 🌐 Neskôr: prechod na doménu `portal.tbau.sk`.

## Preferencie používateľa

- Komunikácia po **slovensky**.
- Bezpečnosť a súlad s **ISO 27000** sú priorita — priebežne dopĺňať do README.
- Po každej práci: aktualizovať **CLAUDE.md** aj **README.md**, commit + push, nasadiť na VPS.
