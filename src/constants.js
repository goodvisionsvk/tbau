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
  // ľavé menu portálu
  nav: [
    { key: 'dashboard', label: 'Prehľad', href: '/dashboard', icon: '🏠' },
    { key: 'users', label: 'Používatelia', href: '/users', icon: '👥', adminOnly: true },
    { key: 'apps', label: 'Aplikácie', href: '/apps', icon: '🧩' },
    { key: 'projects', label: 'Projekty', href: '/projects', icon: '🏗️' },
    { key: 'tasks', label: 'Úlohy', href: '/tasks', icon: '✅' },
    { key: 'tests', label: 'Testy', href: '/tests', icon: '🧪' },
  ],
};
