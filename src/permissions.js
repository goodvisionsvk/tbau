const db = require('./db');
const FULL_ACCESS = ['sef', 'admin'];

function isFullAccess(user) {
  return !!user && FULL_ACCESS.includes(user.role);
}

// Zamestnanecký záznam prepojený na prihláseného používateľa (ak existuje).
function employeeForUser(user) {
  if (!user) return null;
  return db.prepare('SELECT * FROM employees WHERE user_id = ?').get(user.id) || null;
}

// Projekty (stavby), na ktorých je používateľ parťákom.
function foremanProjectIds(user) {
  const emp = employeeForUser(user);
  if (!emp) return [];
  return db
    .prepare('SELECT project_id FROM site_members WHERE employee_id = ? AND is_foreman = 1')
    .all(emp.id)
    .map((r) => r.project_id);
}

// Projekty dostupné pre dochádzku: full access = všetky, parťák = jeho stavby.
function accessibleProjectIds(user) {
  if (isFullAccess(user)) return db.prepare('SELECT id FROM projects').all().map((r) => r.id);
  return foremanProjectIds(user);
}

function accessibleProjects(user) {
  if (isFullAccess(user)) {
    return db.prepare('SELECT * FROM projects ORDER BY name').all();
  }
  const ids = foremanProjectIds(user);
  if (!ids.length) return [];
  const ph = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM projects WHERE id IN (${ph}) ORDER BY name`).all(...ids);
}

function canAccessProject(user, projectId) {
  if (isFullAccess(user)) return true;
  return foremanProjectIds(user).includes(Number(projectId));
}

module.exports = {
  FULL_ACCESS,
  isFullAccess,
  employeeForUser,
  foremanProjectIds,
  accessibleProjectIds,
  accessibleProjects,
  canAccessProject,
};
