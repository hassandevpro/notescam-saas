// RPC — réimplémentation Node des fonctions SECURITY DEFINER de Postgres.
// Chaque RPC reçoit (params, ctx) où ctx = { userId } issu du JWT vérifié.
// L'autorisation (ex-RLS) est imposée ICI, explicitement, sur chaque appel.

import { db, getSchool, tx } from './db.js';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.js';

// --- Helpers d'autorisation -------------------------------------------
function membership(userId) {
  if (!userId) return null;
  return db.prepare(
    `SELECT * FROM school_users WHERE user_id = ? AND active = 1`
  ).get(userId) || null;
}
function requireAdmin(ctx) {
  const m = membership(ctx.userId);
  if (!m || m.role !== 'admin') throw new Error('Non autorisé');
  return m.school_id;
}
function isSuperadmin(userId) {
  return !!db.prepare('SELECT 1 FROM superadmins WHERE user_id = ?').get(userId);
}
const nowISO = () => new Date().toISOString();
const addDaysISO = (d) => new Date(Date.now() + d * 86400000).toISOString();

// --- Table des RPC ----------------------------------------------------
const handlers = {

  // Génération atomique d'un établissement depuis un modèle académique.
  // Miroir LAN de la fonction Postgres apply_academic_template : tout dans une
  // transaction (tx) → aucun objet partiel en cas d'erreur (point #8).
  apply_academic_template(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const classes  = Array.isArray(p.p_classes)  ? p.p_classes  : [];
    const subjects = Array.isArray(p.p_subjects) ? p.p_subjects : [];
    let nc = 0, ns = 0;
    tx(() => {
      const insC = db.prepare(`INSERT INTO classes
        (id, school_id, name, level, section, system, cycle, current_year, max_students)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const c of classes) {
        insC.run(c.id, schoolId, c.name, c.level ?? null, c.section ?? null,
          c.system || 'FR', c.cycle ?? null, c.current_year ?? null, c.max_students ?? null);
        nc++;
      }
      const insS = db.prepare(`INSERT INTO subjects
        (id, school_id, class_id, name, coef, max, position, parent_id, calc_method, formula)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for (const s of subjects) {
        insS.run(s.id, schoolId, s.class_id, s.name, s.coef ?? 1, s.max ?? 20,
          s.position ?? null, s.parent_id ?? null, s.calc_method ?? null, s.formula ?? null);
        ns++;
      }
    });
    return { classes: nc, subjects: ns };
  },

  // Import / fusion intelligente d'un modèle dans un établissement existant.
  // Miroir LAN de merge_academic_template : insère le nouveau + met à jour les
  // conflits, le tout dans une transaction (tx).
  merge_academic_template(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const classes  = Array.isArray(p.p_classes)  ? p.p_classes  : [];
    const subjects = Array.isArray(p.p_subjects) ? p.p_subjects : [];
    const updates  = Array.isArray(p.p_updates)  ? p.p_updates  : [];
    let nc = 0, ns = 0, nu = 0;
    tx(() => {
      const insC = db.prepare(`INSERT INTO classes
        (id, school_id, name, level, section, system, cycle, current_year, max_students)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      for (const c of classes) {
        insC.run(c.id, schoolId, c.name, c.level ?? null, c.section ?? null,
          c.system || 'FR', c.cycle ?? null, c.current_year ?? null, c.max_students ?? null);
        nc++;
      }
      const insS = db.prepare(`INSERT INTO subjects
        (id, school_id, class_id, name, coef, max, position, parent_id, calc_method, formula)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for (const s of subjects) {
        insS.run(s.id, schoolId, s.class_id, s.name, s.coef ?? 1, s.max ?? 20,
          s.position ?? null, s.parent_id ?? null, s.calc_method ?? null, s.formula ?? null);
        ns++;
      }
      const upd = db.prepare(`UPDATE subjects SET coef = ?, max = ? WHERE id = ? AND school_id = ?`);
      for (const u of updates) {
        const r = upd.run(u.coef, u.max, u.id, schoolId);
        nu += r.changes || 0;
      }
    });
    return { classes: nc, subjects: ns, updated: nu };
  },

  // École + admin (1ère configuration). Mono-établissement : une seule école.
  signup_school_and_admin(p, ctx) {
    if (!ctx.userId) throw new Error('Not authenticated');
    if (membership(ctx.userId)) throw new Error('already linked');

    let school = getSchool();
    tx(() => {
      if (!school) {
        const id = randomUUID();
        db.prepare(`INSERT INTO schools
          (id, name, type, region, director, email, current_year, language,
           license_status, license_expires_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
          id, p.p_school_name, p.p_school_type, p.p_region, p.p_director,
          p.p_email, p.p_academic_year, p.p_language || 'fr',
          'trial', addDaysISO(30));
        school = { id };
      }
      db.prepare(`INSERT INTO school_users (id, school_id, user_id, role, full_name, active)
                  VALUES (?,?,?,?,?,1)`)
        .run(randomUUID(), school.id, ctx.userId, 'admin', p.p_full_name);
    });
    return null;
  },

  // Enseignant qui s'inscrit lui-même via le code école.
  signup_teacher(p, ctx) {
    if (!ctx.userId) throw new Error('Not authenticated');
    const school = getSchool();
    if (!school) throw new Error('École introuvable');
    if (membership(ctx.userId)) return null;
    db.prepare(`INSERT INTO school_users (id, school_id, user_id, role, full_name, active)
                VALUES (?,?,?,?,?,1)`)
      .run(randomUUID(), school.id, ctx.userId, 'teacher', p.p_full_name);
    return null;
  },

  // Admin lie un compte existant comme enseignant + crée/relie le record teachers.
  admin_create_teacher_account(p, ctx) {
    const schoolId = requireAdmin(ctx);
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(p.p_target_user_id))
      throw new Error('Utilisateur introuvable');

    db.prepare(`INSERT OR IGNORE INTO school_users (id, school_id, user_id, role, full_name, active)
                VALUES (?,?,?,?,?,1)`)
      .run(randomUUID(), schoolId, p.p_target_user_id, 'teacher', p.p_full_name);

    const existing = db.prepare(
      `SELECT id FROM teachers WHERE school_id = ? AND lower(trim(name)) = lower(trim(?)) LIMIT 1`
    ).get(schoolId, p.p_full_name);
    if (existing) {
      db.prepare('UPDATE teachers SET auth_user_id = ? WHERE id = ?').run(p.p_target_user_id, existing.id);
    } else {
      db.prepare('INSERT INTO teachers (id, school_id, name, auth_user_id) VALUES (?,?,?,?)')
        .run(randomUUID(), schoolId, p.p_full_name, p.p_target_user_id);
    }
    return null;
  },

  // Admin crée un compte personnel de direction (censeur | surveillant).
  admin_create_staff_account(p, ctx) {
    const schoolId = requireAdmin(ctx);
    if (!['censeur', 'surveillant'].includes(p.p_role)) throw new Error('Rôle invalide');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(p.p_target_user_id))
      throw new Error('Utilisateur introuvable');
    db.prepare(`INSERT OR IGNORE INTO school_users (id, school_id, user_id, role, full_name, active)
                VALUES (?,?,?,?,?,1)`)
      .run(randomUUID(), schoolId, p.p_target_user_id, p.p_role, p.p_full_name);
    return null;
  },

  admin_list_staff(p, ctx) {
    const schoolId = requireAdmin(ctx);
    return db.prepare(
      `SELECT id, user_id, full_name, active FROM school_users
       WHERE school_id = ? AND role = ? ORDER BY full_name`
    ).all(schoolId, p.p_role);
  },

  admin_set_staff_active(p, ctx) {
    const schoolId = requireAdmin(ctx);
    db.prepare(
      `UPDATE school_users SET active = ?
       WHERE id = ? AND school_id = ? AND role IN ('censeur','surveillant')`
    ).run(p.p_active ? 1 : 0, p.p_school_user_id, schoolId);
    return null;
  },

  // L'admin redéfinit le mot de passe d'un compte de direction de SON école.
  admin_set_staff_password(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const su = db.prepare(
      `SELECT user_id, role FROM school_users WHERE id = ? AND school_id = ?`
    ).get(p.p_school_user_id, schoolId);
    if (!su) throw new Error('Compte introuvable');
    if (!['censeur', 'surveillant'].includes(su.role)) throw new Error('Rôle non autorisé');
    if (!p.p_new_password || String(p.p_new_password).length < 8)
      throw new Error('Mot de passe trop court (8 caractères min.)');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(p.p_new_password), su.user_id);
    return null;
  },

  update_teacher_profile(p, ctx) {
    const m = membership(ctx.userId);
    if (!m) throw new Error('Non autorisé');
    db.prepare('UPDATE teachers SET name = ?, phone = ? WHERE id = ? AND school_id = ?')
      .run(p.p_name, p.p_phone, p.p_teacher_id, m.school_id);
    return null;
  },

  // Licence : en LAN, l'admin local gère (pas de SuperAdmin distant).
  update_school_license(p, ctx) {
    const m = membership(ctx.userId);
    if (!m || (m.role !== 'admin' && !isSuperadmin(ctx.userId))) throw new Error('Unauthorized');
    db.prepare('UPDATE schools SET license_status = ?, license_expires_at = ? WHERE id = ?')
      .run(p.p_status, p.p_expires_at ?? null, p.p_school_id);
    return null;
  },

  update_school_price_per_student(p, ctx) {
    const m = membership(ctx.userId);
    if (!m || (m.role !== 'admin' && !isSuperadmin(ctx.userId))) throw new Error('Unauthorized');
    db.prepare('UPDATE schools SET price_per_student = ? WHERE id = ?')
      .run(Math.max(0, Number(p.p_price) || 0), p.p_school_id);
    return null;
  },

  // En LAN : renvoie l'unique école avec ses compteurs (forme identique au cloud).
  fetch_all_schools_superadmin(_p, ctx) {
    if (!isSuperadmin(ctx.userId)) throw new Error('Unauthorized');
    return db.prepare(`
      SELECT s.id, s.name, s.type, s.region, s.director, s.email, s.language,
             s.current_year, s.license_status, s.license_expires_at, s.plan,
             s.price_per_student, s.created_at,
             (SELECT COUNT(*) FROM school_users su WHERE su.school_id = s.id AND su.role='admin' AND su.active=1) AS nb_admins,
             (SELECT COUNT(*) FROM students st JOIN classes cl ON cl.id = st.class_id
              WHERE st.school_id = s.id AND cl.current_year = s.current_year) AS nb_students
      FROM schools s ORDER BY s.created_at DESC`).all();
  },

  // Portail parent : données du bulletin par jeton. Pas d'auth (lien public).
  get_parent_portal_data(p) {
    const student = db.prepare('SELECT * FROM students WHERE parent_token = ?').get(p.p_token);
    if (!student) return null;
    const cls    = db.prepare('SELECT * FROM classes WHERE id = ?').get(student.class_id) || null;
    const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(student.school_id) || null;
    const subjects = db.prepare('SELECT * FROM subjects WHERE class_id = ? ORDER BY name').all(student.class_id);
    const grades   = db.prepare('SELECT subject_id, sequence, value FROM grades WHERE student_id = ?').all(student.id);
    const fee = db.prepare(
      'SELECT * FROM student_fees WHERE student_id = ? AND academic_year = ?'
    ).get(student.id, school?.current_year || '') || null;
    return { student, class: cls, school, fee, subjects, grades };
  },
};

export function runRpc(name, params, ctx) {
  const fn = handlers[name];
  if (!fn) return { data: null, error: { message: `RPC inconnue : ${name}` } };
  try {
    return { data: fn(params || {}, ctx) ?? null, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message } };
  }
}
