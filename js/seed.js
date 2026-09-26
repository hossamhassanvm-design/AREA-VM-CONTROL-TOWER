/* ============================================================
   AREA VM CONTROL TOWER V1 — Master Data Seeder
   Seeds ONLY master/static data (Area VMs + complete Branch Master).
   Operational data is intentionally left EMPTY for real production use.
   ============================================================ */

function seedMembers() {
  const branchSets = {
    hz: ['ALX3', 'ARK', 'CIT', 'GSR', 'HLW', 'MNS2', 'OCT', 'TNT1'],
    es: ['DMT', 'GEN', 'HRM', 'MDI', 'SBR', 'SNZ', 'SUZ', 'ZQZ'],
    me: ['BSF', 'HDH', 'HDQ', 'MHL', 'MOE', 'MOK', 'RH2', 'SHB'],
    be: ['ALX2', 'ARB', 'CST', 'FYM', 'ISM', 'LBN', 'SSH2', 'SSH3', 'ZTN']
  };
  return [
    { id: 'm_hz', name: { en: 'Hussien Zanaty', ar: 'حسين زناتي' }, branches: branchSets.hz },
    { id: 'm_es', name: { en: 'Eslam Mahmoud', ar: 'إسلام محمود' }, branches: branchSets.es },
    { id: 'm_me', name: { en: 'Mohamed Emad', ar: 'محمد عماد' }, branches: branchSets.me },
    { id: 'm_be', name: { en: 'Bishry Ahmed', ar: 'بشري أحمد' }, branches: branchSets.be }
  ];
}

/* Kept name for compatibility with Store.reset(); now seeds master data only. */
function seedDemoData(state) {
  state.members = seedMembers();
  return state;
}