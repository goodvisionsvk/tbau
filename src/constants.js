// Firemné údaje TBAU, s. r. o. (zdroj: tbau.sk)
module.exports = {
  company: {
    name: 'TBAU, s. r. o.',
    shortName: 'TBAU',
    since: '1905',
    tagline: 'Stavebná firma — hrubé stavby a monolitické železobetónové konštrukcie',
    description:
      'Komplexné hrubé stavby, monolitické železobetónové konštrukcie, tesárske, ' +
      'murárske a betonárske práce — rodinné domy, administratívne a multifunkčné ' +
      'budovy aj priemyselná výstavba.',
    address: 'Kragujevská 1, 010 01 Žilina',
    ico: '52429822',
    dic: '2121031792',
    icdph: 'SK2121031792',
    email: 'info@tbau.eu',
    phone: '+421 910 383 303',
    web: 'https://tbau.sk',
  },
  // role používateľov
  roles: {
    sef: 'Šéf',
    admin: 'Administratíva',
    parcak: 'Parťák (majster)',
    zamestnanec: 'Zamestnanec',
  },
  fullAccessRoles: ['sef', 'admin'],

  // Hodinová sadzba pre ocenenie práce (reálny spoločný čas práce).
  workHourlyRate: 40, // €/h
  currency: '€',

  // HR pozície (rola zamestnanca vo firme) – odlišné od prihlasovacej role (users.role)
  employeePositions: {
    majitel: 'Majiteľ',
    obchodnik: 'Obchodník',
    uctovnik: 'Účtovník',
    majster: 'Majster',
    robotnik: 'Robotník',
  },
  // --- Obchod (CRM) číselníky (podľa zadania klienta) ---
  customerStatuses: {
    potencialny: 'Potenciálny', osloveny: 'Oslovený', ponuka: 'Ponuka',
    aktivny: 'Aktívny', pozastaveny: 'Pozastavený', ukonceny: 'Ukončený',
  },
  // mapovanie stavu zákazníka na pill farbu
  customerStatusClass: {
    potencialny: 'planned', osloveny: 'in_progress', ponuka: 'medium',
    aktivny: 'active', pozastaveny: 'paused', ukonceny: 'high',
  },
  workTypes: { hodinovka: 'Hodinovka', lv: 'Výkonová práca (LV)', obe: 'Obe' },
  minGroups: { jednotlivci: 'Jednotlivci', dvojice: 'Dvojice', skupina: 'Väčšia skupina' },
  paymentDisciplines: ['V poriadku', 'Oneskorené', 'Spor', 'Neuhradené'],
  contactSources: ['databáza firiem', 'návšteva', 'odporúčanie', 'iné'],
  endReasons: ['Nedostatok ľudí', 'Zlá komunikácia', 'Polier', 'Cena', 'Platby', 'Iné'],
  contactRoles: ['Obchodný kontakt', 'Bauleiter', 'Polier', 'Schvaľovateľ hodín', 'Fakturačný kontakt'],

  // stavy stavby (podľa zadania klienta + navyše Pozastavená)
  projectStatuses: {
    planned: 'Plánovaná',
    active: 'Prebieha',
    paused: 'Pozastavená',
    done: 'Ukončená',
  },

  // druh robotníka (len pre pozíciu Robotník); rozšíriteľné
  workerTrades: [
    'Murár', 'Tesár', 'Zateplovač', 'Betonár', 'Železiar', 'Obkladač',
    'Maliar', 'Elektrikár', 'Inštalatér', 'Pomocný pracovník', 'Iné',
  ],

  // mapovanie aplikácií (slug) na ich reálnu adresu v portáli
  appRoutes: {
    dochadzka: '/dochadzka',
  },
  appHref(app) {
    return this.appRoutes[app.slug] || null;
  },
  appIconBySlug: { dochadzka: 'clock' },
  appIcon(app) {
    return this.appIconBySlug[app.slug] || 'grid';
  },

  // Zostaví ľavé menu podľa role prihláseného používateľa.
  buildNav(user) {
    if (!user) return [];
    const role = user.role;
    const full = ['sef', 'admin'].includes(role);
    const foreman = role === 'parcak';
    const worker = role === 'zamestnanec' || role === 'user';

    // Zamestnanec vidí len svoju dochádzku.
    if (worker && !full && !foreman) {
      return [{ label: '', items: [{ key: 'myattendance', label: 'Moja dochádzka', href: '/moja-dochadzka', icon: 'user' }] }];
    }

    const groups = [{ label: '', items: [{ key: 'dashboard', label: 'Prehľad', href: '/dashboard', icon: 'home' }] }];

    if (full) {
      groups.push({ label: 'HR', items: [
        { key: 'employees', label: 'Zamestnanci', href: '/zamestnanci', icon: 'hardhat' },
        { key: 'attendance', label: 'Dochádzka', href: '/dochadzka', icon: 'clock' },
        { key: 'reports', label: 'Report dochádzky', href: '/reporty', icon: 'chart' },
        { key: 'requests', label: 'Žiadosti', href: '/ziadosti', icon: 'inbox' },
      ] });
      groups.push({ label: 'Obchod', items: [
        { key: 'customers', label: 'Zákazníci', href: '/zakaznici', icon: 'briefcase' },
        { key: 'inquiries', label: 'Dopyty', href: '/dopyty', icon: 'send' },
      ] });
      groups.push({ label: 'Projekty', items: [
        { key: 'projects', label: 'Stavby', href: '/projects', icon: 'building' },
      ] });
      groups.push({ label: 'Systém', items: [
        { key: 'settings', label: 'Nastavenia', href: '/nastavenia', icon: 'settings' },
      ] });
    } else if (foreman) {
      groups.push({ label: 'HR', items: [
        { key: 'attendance', label: 'Dochádzka', href: '/dochadzka', icon: 'clock' },
        { key: 'reports', label: 'Report dochádzky', href: '/reporty', icon: 'chart' },
        { key: 'requests', label: 'Žiadosti', href: '/ziadosti', icon: 'inbox' },
        { key: 'myattendance', label: 'Moja dochádzka', href: '/moja-dochadzka', icon: 'user' },
      ] });
      groups.push({ label: 'Projekty', items: [
        { key: 'projects', label: 'Stavby', href: '/projects', icon: 'building' },
      ] });
    }
    return groups;
  },
};
