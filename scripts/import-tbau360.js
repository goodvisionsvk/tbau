#!/usr/bin/env node
// Jednorazový import dát z TBAU 360 prototypu (zákazníci, stavby, pracovníci) do nášho portálu.
// Dáta NIE sú v gite (dôverné reálne dáta firmy) – JSON sa dodáva ako argument.
// Idempotentné: existujúce záznamy (podľa mena) sa preskočia, nič sa neprepisuje ani nemaže.
//
// Použitie:  node scripts/import-tbau360.js <cesta-k-json>
//   JSON: { customers:[{name,country,status,owner,source,note,contacts:[{name,email,phone}]}],
//           sites:[{name,address,status,kw_od,kw_do,bauleiter,polier,customer_name}],
//           workers:[{first_name,last_name,trade,position}] }
const fs = require('fs');
const db = require('../src/db');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Chýba JSON súbor. Použitie: node scripts/import-tbau360.js <cesta-k-json>');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const S = (v) => { const t = (v == null ? '' : String(v)).trim(); return t || null; };

const findCustomer = db.prepare('SELECT id FROM customers WHERE LOWER(name) = LOWER(?)');
const insCustomer = db.prepare(
  `INSERT INTO customers (name, country, status, owner, source, note, active) VALUES (?,?,?,?,?,?,1)`
);
const insContact = db.prepare(
  'INSERT INTO contacts (customer_id, name, role, email, phone, is_primary) VALUES (?,?,?,?,?,?)'
);
const findProject = db.prepare('SELECT id FROM projects WHERE LOWER(name) = LOWER(?)');
const insProject = db.prepare(
  `INSERT INTO projects (name, code, client, address, status, bauleiter, polier, kw_od, kw_do)
   VALUES (?,?,?,?,?,?,?,?,?)`
);
const findEmployee = db.prepare('SELECT id FROM employees WHERE LOWER(first_name)=LOWER(?) AND LOWER(last_name)=LOWER(?)');
const insEmployee = db.prepare(
  `INSERT INTO employees (first_name, last_name, position, trade, active) VALUES (?,?,?,?,1)`
);

const stat = { cust_new: 0, cust_skip: 0, contacts: 0, site_new: 0, site_skip: 0, emp_new: 0, emp_skip: 0 };

const run = db.transaction(() => {
  // --- Zákazníci + kontakty ---
  for (const c of data.customers || []) {
    const name = S(c.name);
    if (!name) continue;
    let row = findCustomer.get(name);
    if (row) { stat.cust_skip++; continue; }
    const id = insCustomer.run(name, S(c.country) || 'Nemecko', S(c.status) || 'potencialny', S(c.owner), S(c.source), S(c.note)).lastInsertRowid;
    stat.cust_new++;
    (c.contacts || []).forEach((k, i) => {
      if (!S(k.name) && !S(k.email) && !S(k.phone)) return;
      insContact.run(id, S(k.name) || 'Kontakt', S(k.role), S(k.email), S(k.phone), i === 0 ? 1 : 0);
      stat.contacts++;
    });
  }
  // --- Stavby (projekty) ---
  for (const s of data.sites || []) {
    const name = S(s.name);
    if (!name) continue;
    if (findProject.get(name)) { stat.site_skip++; continue; }
    insProject.run(name, null, S(s.customer_name), S(s.address), S(s.status) || 'planned',
      S(s.bauleiter), S(s.polier), s.kw_od ?? null, s.kw_do ?? null);
    stat.site_new++;
  }
  // --- Pracovníci (zamestnanci) ---
  for (const w of data.workers || []) {
    const fn = S(w.first_name), ln = S(w.last_name);
    if (!fn || !ln) continue;
    if (findEmployee.get(fn, ln)) { stat.emp_skip++; continue; }
    insEmployee.run(fn, ln, S(w.position) || 'robotnik', S(w.trade));
    stat.emp_new++;
  }
});

run();
console.log('Import TBAU360 hotový:');
console.log(`  Zákazníci:  ${stat.cust_new} nových, ${stat.cust_skip} preskočených (už existujú), ${stat.contacts} kontaktov`);
console.log(`  Stavby:     ${stat.site_new} nových, ${stat.site_skip} preskočených`);
console.log(`  Pracovníci: ${stat.emp_new} nových, ${stat.emp_skip} preskočených`);
