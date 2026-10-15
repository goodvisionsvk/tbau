// Preklad slovenských profesií a úrovne nemčiny do nemčiny – pre dopyt (e-mail) nemeckým firmám.

// SK druh robotníka → DE profesia
const TRADE_DE = {
  'Murár': 'Maurer',
  'Debniar': 'Schalungsbauer',
  'Betonár': 'Betonbauer',
  'Železiar': 'Eisenflechter',
  'Žeriavnik': 'Kranführer',
  'Tesár': 'Zimmermann',
  'Zateplovač': 'Fassaden-/WDVS-Monteur',
  'Obkladač': 'Fliesenleger',
  'Maliar': 'Maler',
  'Elektrikár': 'Elektriker',
  'Inštalatér': 'Installateur',
  'Pomocný pracovník': 'Helfer',
};

function tradeDe(trade) {
  if (!trade) return null;
  return TRADE_DE[trade] || trade; // „Iné"/neznáme necháme tak, ako sú zadané
}

// SK úroveň nemčiny → nemecká fráza do e-mailu (alebo null = neuvádzať)
function germanLevelPhrase(level) {
  if (!level || level === 'žiadna') return null;
  if (level === 'základy') return 'Deutsch Grundkenntnisse';
  if (level === 'v stavebníctve') return 'Deutschkenntnisse im Baubereich';
  return 'Deutschkenntnisse ' + level; // Niveau 1/2/3
}

// Riadok pracovníka do zoznamu: „Richard – Vorarbeiter / Maurer, Deutschkenntnisse Niveau 2"
function workerLine(emp) {
  const parts = [];
  if (emp.position === 'majster') parts.push('Vorarbeiter');
  const t = tradeDe(emp.trade);
  if (t) parts.push(t);
  if (!parts.length) parts.push('Bauhelfer');
  let line = emp.first_name + ' – ' + parts.join(' / ');
  const lvl = germanLevelPhrase(emp.german_level);
  if (lvl) line += ', ' + lvl;
  return line;
}

// Zoznam oblastí (Bereiche) z vybraných pracovníkov – pre vetu „Bedarf … in den Bereichen …"
function bereicheFrom(emps) {
  const set = [];
  emps.forEach((e) => {
    const t = tradeDe(e.trade);
    if (t && !set.includes(t)) set.push(t);
  });
  return set;
}

module.exports = { tradeDe, germanLevelPhrase, workerLine, bereicheFrom };
