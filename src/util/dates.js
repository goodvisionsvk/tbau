// Pomocníci na ISO týždne a dátumy (všetko v UTC, formát YYYY-MM-DD).
const DOW = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const MONTHS = [
  'január', 'február', 'marec', 'apríl', 'máj', 'jún',
  'júl', 'august', 'september', 'október', 'november', 'december',
];

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

// ISO týždeň pre JS Date → { year, week }
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;           // Po=0 .. Ne=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);        // štvrtok tohto týždňa
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return { year: d.getUTCFullYear(), week };
}

function currentIsoWeek() { return isoWeek(new Date()); }

// Pondelok daného ISO týždňa
function mondayOfIsoWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + (week - 1) * 7);
  return monday;
}

// 7 dní týždňa ako [{date, label, day, month, weekend}]
function weekDates(year, week) {
  const monday = mondayOfIsoWeek(year, week);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    out.push({
      date: fmt(d), label: DOW[i], day: d.getUTCDate(),
      month: d.getUTCMonth() + 1, weekend: i >= 5,
    });
  }
  return out;
}

// Prvý a posledný deň mesiaca
function monthRange(year, month) {
  return {
    start: fmt(new Date(Date.UTC(year, month - 1, 1))),
    end: fmt(new Date(Date.UTC(year, month, 0))),
  };
}

function monthName(month) { return MONTHS[month - 1] || ''; }

module.exports = { isoWeek, currentIsoWeek, mondayOfIsoWeek, weekDates, monthRange, monthName, DOW, MONTHS };
