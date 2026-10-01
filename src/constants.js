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

  // Zostaví ľavé menu podľa role prihláseného používateľa.
  buildNav(user) {
    if (!user) return [];
    const role = user.role;
    const full = ['sef', 'admin'].includes(role);
    const foreman = role === 'parcak';
    const worker = role === 'zamestnanec' || role === 'user';

    // Zamestnanec vidí len svoju dochádzku.
    if (worker && !full && !foreman) {
      return [{ key: 'myattendance', label: 'Moja dochádzka', href: '/moja-dochadzka', icon: '🙋' }];
    }

    const items = [{ key: 'dashboard', label: 'Prehľad', href: '/dashboard', icon: '🏠' }];
    if (full || foreman) {
      items.push({ key: 'attendance', label: 'Dochádzka', href: '/dochadzka', icon: '🕒' });
      items.push({ key: 'requests', label: 'Žiadosti', href: '/ziadosti', icon: '✉️' });
      items.push({ key: 'reports', label: 'Reporty', href: '/reporty', icon: '📊' });
      items.push({ key: 'projects', label: 'Stavby', href: '/projects', icon: '🏗️' });
    }
    if (full) {
      items.push({ key: 'employees', label: 'Zamestnanci', href: '/zamestnanci', icon: '👷' });
      items.push({ key: 'settings', label: 'Nastavenia', href: '/nastavenia', icon: '⚙️' });
    }
    // parťák má aj vlastnú dochádzku
    if (foreman) {
      items.push({ key: 'myattendance', label: 'Moja dochádzka', href: '/moja-dochadzka', icon: '🙋' });
    }
    return items;
  },
};
