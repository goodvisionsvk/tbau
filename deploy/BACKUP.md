# Zálohovanie TBAU portálu

Cieľ: denná záloha databázy a dokumentov portálu, prírastkovo (len nové/zmenené) na
firemné **NAS Synology**. Dáta tak existujú na dvoch miestach: produkčný server (VPS) + NAS.

## Čo sa zálohuje

| Dáta | Kde na serveri | Poznámka |
|------|----------------|----------|
| Databáza (users, dochádzka, obchod…) | `/opt/tbau-portal/data/tbau.db` | denná konzistentná kópia → `backups/` |
| Nahraté smenovky (JPG/PNG/PDF) | `/opt/tbau-portal/data/uploads/` | súbory, rsync prenesie len nové |
| Denné zálohy DB (gzip) | `/opt/tbau-portal/backups/tbau-*.db.gz` | rotácia 30 dní |

Kód aplikácie netreba zálohovať samostatne – je v Git repozitári (GitHub).

## Časť 1 – Server (VPS): denná lokálna záloha DB ✅ pripravené

Na serveri beží **systemd timer**, ktorý raz denne (02:30) spraví konzistentnú kópiu databázy,
skomprimuje ju a uloží do `/opt/tbau-portal/backups/` (ponecháva posledných 30).

Inštalácia (jednorazovo, ako `tbau`):

```bash
sudo cp /opt/tbau-portal/deploy/tbau-backup.service /etc/systemd/system/
sudo cp /opt/tbau-portal/deploy/tbau-backup.timer   /etc/systemd/system/
mkdir -p /opt/tbau-portal/backups
sudo systemctl daemon-reload
sudo systemctl enable --now tbau-backup.timer
# overenie:
systemctl list-timers tbau-backup.timer
node /opt/tbau-portal/scripts/backup-db.js   # ručné spustenie (test)
ls -lh /opt/tbau-portal/backups
```

Stav poslednej zálohy je vidno aj v portáli: **Nastavenia → Zálohovanie dát**.

## Časť 2 – NAS Synology: prírastkové sťahovanie z VPS 🔧 nastaviť na NAS

Odporúčaný smer: **NAS si dáta ťahá z VPS** (NAS otvára spojenie von, nemusí byť vystavené do
internetu). Prenos je **prírastkový** – prenesú sa len nové/zmenené súbory.

### Prístup pre NAS (vytvorí sa na VPS)

Na VPS sa vytvorí vyhradený **read-only** účet `backup` s SSH kľúčom, obmedzený len na čítanie
záloh a uploadov (cez `rrsync`/`ForceCommand`). NAS sa pripája týmto kľúčom. *(Pripraví správca
servera – viď „Čo potrebujem od teba“ v chate.)*

Zdrojové cesty na VPS:
- `/opt/tbau-portal/backups/` – gzip zálohy DB
- `/opt/tbau-portal/data/uploads/` – dokumenty (smenovky)

### Možnosť A – Hyper Backup (odporúčané)

1. V DSM nainštaluj **Hyper Backup**.
2. *Vytvoriť zálohu → Priečinky a balíčky → rsync (server kompatibilný s rsync)* resp.
   „remote server (rsync)“ a zadaj: adresa VPS, port SSH, používateľ `backup`, kľúč.
3. Zdroj: vyššie uvedené cesty. Cieľ: napr. `tbau-backup` na zvolenom zväzku.
4. Plán: **denne** (napr. 03:30, po tom, ako VPS spraví zálohu o 02:30).
5. Zapni **verziovanie/rotáciu** podľa priestoru (napr. 30 verzií, Smart Recycle).

### Možnosť B – Task Scheduler + rsync

*Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script* (denne):

```bash
rsync -az --delete \
  -e "ssh -i /volume1/homes/backup/.ssh/tbau_vps -p 22" \
  backup@80.211.202.23:/opt/tbau-portal/backups/ \
  /volume1/tbau-backup/db/
rsync -az \
  -e "ssh -i /volume1/homes/backup/.ssh/tbau_vps -p 22" \
  backup@80.211.202.23:/opt/tbau-portal/data/uploads/ \
  /volume1/tbau-backup/uploads/
```

## Obnova zo zálohy

```bash
# DB (na serveri alebo lokálne):
gunzip -c tbau-2026-10-14-02-30-00.db.gz > tbau-restore.db
# skontroluj integritu:
sqlite3 tbau-restore.db "PRAGMA integrity_check;"
# nasadenie: zastav službu, nahraď data/tbau.db, zmaž -wal/-shm, naštartuj službu
sudo systemctl stop tbau-portal
cp tbau-restore.db /opt/tbau-portal/data/tbau.db
rm -f /opt/tbau-portal/data/tbau.db-wal /opt/tbau-portal/data/tbau.db-shm
sudo systemctl start tbau-portal
```

Dokumenty (uploads) sa obnovia skopírovaním späť do `/opt/tbau-portal/data/uploads/`.
