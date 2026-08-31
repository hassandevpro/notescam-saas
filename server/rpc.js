// RPC — réimplémentation Node des fonctions SECURITY DEFINER de Postgres.
// Chaque RPC reçoit (params, ctx) où ctx = { userId } issu du JWT vérifié.
// L'autorisation (ex-RLS) est imposée ICI, explicitement, sur chaque appel.

import { db, getSchool, tx } from './db.js';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.js';
import { createRevision, decideRevision, createLineReallocation, decideLineReallocation } from './budgetOps.js';
import { isParentAccount, allowsStudent, loadScope } from './scopeGuard.js';

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

// Codes de rôles de gouvernance « système » (repli de validation quand le
// catalogue governance_roles n'est pas encore rempli en LAN — le moteur consomme
// alors le catalogue par défaut côté client).
const DEFAULT_GOV_CODES = new Set([
  'fondatrice', 'coordonnateur_general', 'raf', 'principal', 'directrice_primaire',
  'responsable_maternelle', 'vice_principal', 'directrice_adjointe_primaire', 'caissier',
]);

// ── ESPACE PARENT — helpers d'autorisation ──────────────────────────────────
// Miroir EXACT de public.parent_owns_student (supabase_parent_portal.sql §2).
// C'est le seul point de décision de tout l'espace parent, côté LAN comme côté
// cloud : chaque RPC parent_* l'appelle en première ligne et rend null s'il
// répond faux — jamais une erreur, qui confirmerait l'existence de l'élève.
function parentOwnsStudent(userId, studentId) {
  if (!userId || !studentId) return false;
  try {
    return !!db.prepare(
      `SELECT 1 FROM parent_student_links l
         JOIN parent_accounts a ON a.user_id = l.parent_user_id
        WHERE l.parent_user_id = ? AND l.student_id = ?
          AND l.active = 1 AND a.active = 1`,
    ).get(userId, studentId);
  } catch { return false; }
}

// Lecture tolérante : plusieurs tables analytiques (appreciations, conduct,
// *_bulletins) n'existent qu'en Cloud — le LAN calcule ces documents côté
// application. Une table absente rend [], jamais une erreur : l'espace parent
// affiche simplement moins, il ne tombe pas.
function safeAll(sql, ...params) {
  try { return db.prepare(sql).all(...params); } catch { return []; }
}
function safeGet(sql, ...params) {
  try { return db.prepare(sql).get(...params) ?? null; } catch { return null; }
}

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

  // Parité avec le cloud (admin_list_staff, supabase_staff_scope_admin.sql) :
  // rôle, capacités et PÉRIMÈTRE. Sans les colonnes de périmètre, l'éditeur se
  // rouvrait vide et l'enregistrer effaçait la répartition en place.
  admin_list_staff(p, ctx) {
    const schoolId = requireAdmin(ctx);
    return db.prepare(
      `SELECT id, user_id, full_name, active, role, permissions,
              scope_sections, scope_cycles, scope_class_ids
         FROM school_users
        WHERE school_id = ? AND role = ? ORDER BY full_name`
    ).all(schoolId, p.p_role);
  },

  // Périmètre de responsabilité d'un membre : sections / cycles / classes.
  // Dans un complexe scolaire, il répartit la configuration entre le directeur
  // du fondamental (MINEDUB) et le proviseur du secondaire (MINESEC) ; tableaux
  // vides = tout l'établissement.
  //
  // SQLite n'a pas de type tableau : on stocke du JSON en TEXT. Côté client,
  // `normalizeScope` (core/surveillantScope) accepte les deux formes.
  admin_set_staff_scope(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const arr = (v) => JSON.stringify(Array.isArray(v) ? v : []);
    db.prepare(
      `UPDATE school_users
          SET scope_sections = ?, scope_cycles = ?, scope_class_ids = ?
        WHERE id = ? AND school_id = ? AND role IN ('admin','censeur','surveillant')`
    ).run(arr(p.p_sections), arr(p.p_cycles), arr(p.p_class_ids), p.p_school_user_id, schoolId);
    return null;
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

  // Gouvernance : attribuer/mettre à jour un rôle (avec secteur/dates/statut).
  admin_assign_governance_role(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const m = membership(ctx.userId);
    const code = String(p.p_role || '');
    const known = db.prepare('SELECT 1 FROM governance_roles WHERE school_id = ? AND code = ?').get(schoolId, code)
      || DEFAULT_GOV_CODES.has(code);
    if (!known) throw new Error('Rôle de gouvernance inconnu : ' + code);
    const status = p.p_status || 'active';
    const existing = db.prepare('SELECT id FROM user_governance_roles WHERE school_id = ? AND user_id = ? AND role = ?')
      .get(schoolId, p.p_user_id, code);
    let id;
    if (existing) {
      id = existing.id;
      db.prepare('UPDATE user_governance_roles SET sector=?, start_date=?, end_date=?, status=?, updated_at=? WHERE id=?')
        .run(p.p_sector ?? null, p.p_start_date ?? null, p.p_end_date ?? null, status, nowISO(), id);
    } else {
      id = randomUUID();
      db.prepare(`INSERT INTO user_governance_roles (id, school_id, user_id, role, sector, start_date, end_date, status)
                  VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, schoolId, p.p_user_id, code, p.p_sector ?? null, p.p_start_date ?? null, p.p_end_date ?? null, status);
    }
    db.prepare(`INSERT INTO governance_role_history (id, school_id, user_id, role_code, action, sector, start_date, end_date, actor_id, actor_name)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), schoolId, p.p_user_id, code, 'assigned', p.p_sector ?? null, p.p_start_date ?? null, p.p_end_date ?? null, ctx.userId, m?.full_name ?? null);
    return id;
  },

  admin_revoke_governance_role(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const m = membership(ctx.userId);
    const row = db.prepare('SELECT * FROM user_governance_roles WHERE id = ? AND school_id = ?').get(p.p_id, schoolId);
    if (!row) return null;
    db.prepare('DELETE FROM user_governance_roles WHERE id = ? AND school_id = ?').run(p.p_id, schoolId);
    db.prepare(`INSERT INTO governance_role_history (id, school_id, user_id, role_code, action, sector, actor_id, actor_name)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(randomUUID(), schoolId, row.user_id, row.role, 'revoked', row.sector ?? null, ctx.userId, m?.full_name ?? null);
    return null;
  },

  // Édition du catalogue de rôles (Phase 2). Code immuable après création.
  admin_upsert_governance_role(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const code = String(p.p_code || '').trim();
    if (!code) throw new Error('Code requis');
    if (!['complex', 'sector'].includes(p.p_scope)) throw new Error('Portée invalide');
    const J = (v) => JSON.stringify(Array.isArray(v) ? v : (v ? JSON.parse(v) : []));
    if (p.p_id) {
      const row = db.prepare('SELECT id FROM governance_roles WHERE id = ? AND school_id = ?').get(p.p_id, schoolId);
      if (!row) throw new Error('Rôle introuvable');
      db.prepare(`UPDATE governance_roles SET name=?, description=?, rank=?, scope=?, sector=?,
                    permissions=?, pages=?, dashboards=?, workflows=?, active=?, updated_at=?
                  WHERE id=? AND school_id=?`)
        .run(p.p_name, p.p_description ?? null, Number(p.p_rank) || 0, p.p_scope, p.p_sector ?? null,
             J(p.p_permissions), J(p.p_pages), J(p.p_dashboards), J(p.p_workflows),
             p.p_active === false ? 0 : 1, nowISO(), p.p_id, schoolId);
      return p.p_id;
    }
    if (db.prepare('SELECT 1 FROM governance_roles WHERE school_id = ? AND code = ?').get(schoolId, code))
      throw new Error('Un rôle avec ce code existe déjà : ' + code);
    const id = randomUUID();
    db.prepare(`INSERT INTO governance_roles (id, school_id, code, name, description, rank, scope, sector,
                  permissions, pages, dashboards, workflows, active, is_system)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
      .run(id, schoolId, code, p.p_name, p.p_description ?? null, Number(p.p_rank) || 0, p.p_scope, p.p_sector ?? null,
           J(p.p_permissions), J(p.p_pages), J(p.p_dashboards), J(p.p_workflows), p.p_active === false ? 0 : 1);
    return id;
  },

  admin_delete_governance_role(p, ctx) {
    const schoolId = requireAdmin(ctx);
    const row = db.prepare('SELECT * FROM governance_roles WHERE id = ? AND school_id = ?').get(p.p_id, schoolId);
    if (!row) return null;
    if (row.is_system) throw new Error('Rôle système : désactivez-le au lieu de le supprimer');
    db.prepare('DELETE FROM governance_roles WHERE id = ? AND school_id = ?').run(p.p_id, schoolId);
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

  // ── Opérations budgétaires tracées V3 — autorité serveur, atomiques ──
  // Révision du budget annuel (opération exceptionnelle, fortement tracée).
  budget_create_revision(p, ctx) { return createRevision(p, ctx); },
  budget_decide_revision(p, ctx) { return decideRevision(p, ctx); },
  // Réallocation entre LIGNES (transfert de montant annuel, total inchangé).
  // (E8) L'ancienne réallocation entre nœuds period/sector a été supprimée.
  budget_create_line_realloc(p, ctx) { return createLineReallocation(p, ctx); },
  budget_decide_line_realloc(p, ctx) { return decideLineReallocation(p, ctx); },

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

  // ══════════════════════════════════════════════════════════════════════════
  // ESPACE PARENT — miroir LAN de supabase_parent_portal.sql
  // ══════════════════════════════════════════════════════════════════════════
  // Chaque handler s'ouvre sur parentOwnsStudent() et rend null si le compte
  // n'est pas le parent de CET élève. L'id passé dans l'URL ne suffit donc
  // jamais : c'est le test 18 du cahier des charges, tenu ici et non dans
  // l'interface.

  // Profil du parent + ses enfants. La seule RPC qui n'attend pas d'élève :
  // elle EST la liste des élèves autorisés, tout le reste en découle.
  parent_context(p, ctx) {
    if (!ctx?.userId || !isParentAccount(ctx.userId)) return null;
    const acct = db.prepare(
      'SELECT * FROM parent_accounts WHERE user_id = ? AND active = 1',
    ).get(ctx.userId);
    if (!acct) return null;

    const links = db.prepare(
      `SELECT l.id AS link_id, l.relationship, l.is_primary, l.student_id
         FROM parent_student_links l
        WHERE l.parent_user_id = ? AND l.active = 1`,
    ).all(ctx.userId);

    const children = [];
    for (const l of links) {
      const st = db.prepare('SELECT * FROM students WHERE id = ?').get(l.student_id);
      if (!st || st.archived_at) continue;
      const cl = st.class_id ? db.prepare('SELECT * FROM classes WHERE id = ?').get(st.class_id) : null;
      const sc = db.prepare('SELECT * FROM schools WHERE id = ?').get(st.school_id) || null;
      const un = cl?.unit_id ? safeGet('SELECT * FROM school_units WHERE id = ?', cl.unit_id) : null;
      children.push({
        link_id: l.link_id,
        relationship: l.relationship,
        is_primary: !!l.is_primary,
        name: st.name,
        student: {
          id: st.id, name: st.name, matricule: st.matricule, photo_url: st.photo_url,
          gender: st.gender, date_naissance: st.date_naissance, statut: st.statut,
        },
        class: cl ? {
          id: cl.id, name: cl.name, level: cl.level, section: cl.section,
          cycle: cl.cycle, serie: cl.serie, system: cl.system,
        } : null,
        school: sc ? {
          id: sc.id, name: sc.name, logo_url: sc.logo_url, language: sc.language,
          currency: sc.currency, current_year: sc.current_year,
          show_rank: !!sc.parent_show_rank,
        } : null,
        unit: un ? { id: un.id, name: un.name, section_key: un.section_key } : null,
      });
    }
    children.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return {
      parent: {
        id: acct.id, user_id: acct.user_id, full_name: acct.full_name,
        phone: acct.phone, email: acct.email,
      },
      children,
    };
  },

  // Notes et résultats. Les notes rendues sont celles du SEUL enfant ; de la
  // classe ne sortent que des AGRÉGATS (moyenne, min, max, effectif) et, si
  // l'école le publie, un rang — un entier, jamais un classement nominatif.
  parent_child_grades(p, ctx) {
    const sid = p.p_student;
    if (!parentOwnsStudent(ctx?.userId, sid)) return null;

    const st = db.prepare('SELECT * FROM students WHERE id = ?').get(sid);
    const cl = st?.class_id ? db.prepare('SELECT * FROM classes WHERE id = ?').get(st.class_id) : null;
    const sc = db.prepare('SELECT * FROM schools WHERE id = ?').get(st.school_id) || null;
    const sys = cl?.system || 'FR';
    const scale = sys === 'FR' ? 20 : 100;
    const showRank = !!sc?.parent_show_rank;

    const subjects = db.prepare(
      'SELECT id, name, coef, max, position, parent_id FROM subjects WHERE class_id = ? ORDER BY COALESCE(position, 999), name',
    ).all(st.class_id || '');

    const grades = db.prepare(
      'SELECT subject_id, sequence, value FROM grades WHERE student_id = ?',
    ).all(sid);

    // Moyenne pondérée par élève et par séquence, sur les matières PRINCIPALES
    // (parent_id NULL) — même règle que src/core/bulletinEngine.js, pour que
    // l'agrégat parent ne puisse pas diverger du bulletin de l'école.
    // Le GLOB écarte 'ABS' et les valeurs non numériques.
    const NUM = `g.value IS NOT NULL AND g.value <> '' AND g.value GLOB '[0-9]*' AND g.value NOT GLOB '*[A-Za-z]*'`;
    const moyennes = safeAll(
      `SELECT g.student_id, g.sequence,
              SUM(CAST(replace(g.value, ',', '.') AS REAL) / NULLIF(COALESCE(sb.max, 20), 0)
                  * ? * COALESCE(sb.coef, 1)) AS pond,
              SUM(COALESCE(sb.coef, 1)) AS coefs
         FROM grades g
         JOIN subjects sb ON sb.id = g.subject_id
         JOIN students stu ON stu.id = g.student_id
        WHERE g.class_id = ? AND stu.archived_at IS NULL AND sb.parent_id IS NULL AND ${NUM}
        GROUP BY g.student_id, g.sequence`,
      scale, st.class_id || '',
    ).map((r) => ({ ...r, moyenne: r.coefs ? Math.round((r.pond / r.coefs) * 100) / 100 : null }))
      .filter((r) => r.moyenne != null);

    const bySeq = new Map();
    for (const r of moyennes) {
      if (!bySeq.has(r.sequence)) bySeq.set(r.sequence, []);
      bySeq.get(r.sequence).push(r);
    }
    const class_stats = [];
    const ranks = [];
    for (const [sequence, rows] of [...bySeq].sort((a, b) => a[0] - b[0])) {
      const vals = rows.map((r) => r.moyenne);
      class_stats.push({
        sequence,
        class_avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
        min: Math.min(...vals),
        max: Math.max(...vals),
        size: vals.length,
      });
      if (showRank) {
        const sorted = [...rows].sort((a, b) => b.moyenne - a.moyenne);
        const mine = sorted.findIndex((r) => r.student_id === sid);
        if (mine >= 0) {
          // Rang « compétition » : deux ex æquo partagent le même rang.
          const rang = sorted.filter((r) => r.moyenne > sorted[mine].moyenne).length + 1;
          ranks.push({ sequence, rank: rang, size: sorted.length });
        }
      }
    }

    return {
      student_id: sid,
      system: sys,
      max_scale: scale,
      show_rank: showRank,
      subjects,
      grades,
      // Tables Cloud uniquement : le LAN produit ces éléments côté application.
      appreciations: safeAll(
        'SELECT seq_idx AS sequence, text FROM appreciations WHERE student_id = ?', sid),
      conduct: safeAll(
        'SELECT seq_idx AS sequence, conduct, diligence FROM conduct WHERE student_id = ?', sid),
      council: safeAll(
        `SELECT sequence, appreciation, decision, th, encouragement, felicitation
           FROM student_absences WHERE student_id = ? ORDER BY sequence`, sid),
      class_stats,
      ranks,
    };
  },

  // Bulletins : AUCUN RECALCUL. Ce qui est rendu a été publié par l'école.
  parent_child_bulletins(p, ctx) {
    const sid = p.p_student;
    if (!parentOwnsStudent(ctx?.userId, sid)) return null;
    const st = db.prepare('SELECT school_id FROM students WHERE id = ?').get(sid);
    const sc = db.prepare('SELECT parent_show_rank FROM schools WHERE id = ?').get(st.school_id);
    const showRank = !!sc?.parent_show_rank;
    const hideRank = (rows, key = 'rang') =>
      rows.map((r) => (showRank ? r : { ...r, [key]: null }));

    return {
      student_id: sid,
      show_rank: showRank,
      apc: hideRank(safeAll(
        `SELECT trimestre_id, moyenne_generale, cote, rang, appreciation_generale,
                decision_conseil, updated_at
           FROM apc_bulletins WHERE eleve_id = ? ORDER BY trimestre_id`, sid)),
      prim: hideRank(safeAll(
        `SELECT trimestre_id, moyenne_generale, cote_generale, rang, appreciation_generale,
                decision_conseil, updated_at
           FROM prim_bulletins WHERE eleve_id = ? ORDER BY trimestre_id`, sid)),
      prim_annuel: hideRank(safeAll(
        `SELECT annee, moyenne_annuelle, cote_annuelle, rang_annuel, decision
           FROM prim_resultats_annuels WHERE eleve_id = ? ORDER BY annee`, sid), 'rang_annuel'),
      maternelle: safeAll(
        `SELECT trimestre_id, appreciation_generale, decision, updated_at
           FROM mat_bulletins WHERE eleve_id = ? ORDER BY trimestre_id`, sid),
    };
  },

  // Absences et retards — datés (ce que la famille attend) et cumulés (ce qui
  // figurera sur le bulletin).
  parent_child_attendance(p, ctx) {
    const sid = p.p_student;
    if (!parentOwnsStudent(ctx?.userId, sid)) return null;
    return {
      student_id: sid,
      events: safeAll(
        `SELECT id, date, session, status, motif, year_label
           FROM attendance WHERE student_id = ? ORDER BY date DESC`, sid),
      late: safeAll(
        `SELECT id, date, arrival_time, reason, justified, justification, validated, year_label
           FROM late_arrivals WHERE student_id = ? ORDER BY date DESC`, sid),
      totals: safeAll(
        `SELECT sequence, abs_j AS abs_justifiees, abs_nj AS abs_non_justifiees, conduite
           FROM student_absences WHERE student_id = ? ORDER BY sequence`, sid),
    };
  },

  // Frais : CONSULTATION SEULE. Aucun chemin d'écriture n'existe ici, et le
  // parent ne devient pas pour autant un utilisateur du service financier.
  parent_child_fees(p, ctx) {
    const sid = p.p_student;
    if (!parentOwnsStudent(ctx?.userId, sid)) return null;
    const st = db.prepare('SELECT school_id FROM students WHERE id = ?').get(sid);
    const sc = db.prepare('SELECT current_year, currency FROM schools WHERE id = ?').get(st.school_id);
    const year = p.p_year || sc?.current_year || '';

    return {
      student_id: sid,
      academic_year: year,
      currency: sc?.currency || null,
      fee: safeGet(
        `SELECT frais_annuels, frais_payes, date_dernier_paiement, payment_mode,
                tranches, adjustments, notes
           FROM student_fees WHERE student_id = ? AND academic_year = ?
          ORDER BY created_at DESC LIMIT 1`, sid, year),
      items: safeAll(
        `SELECT id, name, category, amount, mandatory, payment_type, status, academic_year
           FROM student_fee_items WHERE student_id = ? ORDER BY name`, sid),
      // Les contre-passations sont rendues telles quelles : la famille voit un
      // registre honnête, pas un solde retouché.
      payments: safeAll(
        `SELECT id, date, amount, note, receipt_no, academic_year,
                reversal_of, void_reason, recorded_by_name
           FROM fee_payments WHERE student_id = ? ORDER BY date DESC, created_at DESC`, sid),
    };
  },

  // Documents disponibles. Les PDF ne sont pas stockés : ils sont régénérés par
  // l'application (receiptDoc.js, moteurs de bulletin) à partir de ces lignes.
  parent_child_documents(p, ctx) {
    const sid = p.p_student;
    if (!parentOwnsStudent(ctx?.userId, sid)) return null;
    const bulletins = [
      ...safeAll(`SELECT 'apc' AS engine, trimestre_id AS period, updated_at
                    FROM apc_bulletins WHERE eleve_id = ?`, sid),
      ...safeAll(`SELECT 'prim' AS engine, trimestre_id AS period, updated_at
                    FROM prim_bulletins WHERE eleve_id = ?`, sid),
      ...safeAll(`SELECT 'maternelle' AS engine, trimestre_id AS period, updated_at
                    FROM mat_bulletins WHERE eleve_id = ?`, sid),
    ].sort((a, b) => String(a.period).localeCompare(String(b.period)));

    return {
      student_id: sid,
      meetings: safeAll(
        `SELECT id, target, reason, meeting_date, meeting_time, location, status, outcome
           FROM parent_meetings WHERE student_id = ? ORDER BY meeting_date DESC`, sid),
      receipts: safeAll(
        `SELECT id, receipt_no, date, amount, academic_year
           FROM fee_payments
          WHERE student_id = ? AND receipt_no IS NOT NULL AND reversal_of IS NULL
          ORDER BY date DESC`, sid),
      bulletins,
    };
  },

  parent_notifications(p, ctx) {
    if (!ctx?.userId || !isParentAccount(ctx.userId)) return null;
    const limit = Math.max(1, Math.min(Number(p.p_limit) || 50, 200));
    return safeAll(
      `SELECT id, type, title, body, link, read, created_at
         FROM notifications
        WHERE recipient_role = 'parent' AND recipient_id = ?
        ORDER BY created_at DESC LIMIT ?`, ctx.userId, limit);
  },

  parent_dashboard(p, ctx) {
    const context = handlers.parent_context({}, ctx);
    if (!context) return null;
    return {
      parent: context.parent,
      children: context.children.map((c) => ({
        ...c,
        fees:       handlers.parent_child_fees({ p_student: c.student.id }, ctx),
        attendance: handlers.parent_child_attendance({ p_student: c.student.id }, ctx),
        bulletins:  handlers.parent_child_bulletins({ p_student: c.student.id }, ctx),
      })),
      notifications: handlers.parent_notifications({ p_limit: 10 }, ctx) || [],
    };
  },

  // La SEULE écriture de tout l'espace parent : sa propre fiche de contact.
  parent_update_profile(p, ctx) {
    if (!ctx?.userId || !isParentAccount(ctx.userId)) throw new Error('Non autorisé');
    const name  = (p.p_full_name || '').trim();
    const phone = (p.p_phone || '').trim();
    db.prepare(
      `UPDATE parent_accounts
          SET full_name = COALESCE(NULLIF(?, ''), full_name),
              phone     = COALESCE(NULLIF(?, ''), phone),
              updated_at = ?
        WHERE user_id = ? AND active = 1`,
    ).run(name, phone, new Date().toISOString(), ctx.userId);
    return handlers.parent_context({}, ctx);
  },

  // ── Côté école : création et rattachement ─────────────────────────────────
  // Le cloisonnement par secteur s'applique À LA CRÉATION DU LIEN, via
  // allowsStudent() — la fonction qui garde déjà toutes les lectures d'élèves.
  // Aucune règle de secteur n'est réécrite ici.
  admin_create_parent_account(p, ctx) {
    const m = membership(ctx?.userId);
    if (!m || !['admin', 'censeur'].includes(m.role)) throw new Error('Non autorisé');
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(p.p_user_id)) {
      throw new Error('Utilisateur introuvable');
    }
    // Garde-fou central : personnel et parent ne se croisent jamais.
    if (db.prepare('SELECT 1 FROM school_users WHERE user_id = ?').get(p.p_user_id)) {
      throw new Error('Ce compte appartient au personnel : il ne peut pas être un compte parent');
    }
    const existing = db.prepare('SELECT id FROM parent_accounts WHERE user_id = ?').get(p.p_user_id);
    if (existing) {
      db.prepare(
        `UPDATE parent_accounts
            SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone),
                email = COALESCE(?, email), active = 1, updated_at = ?
          WHERE user_id = ?`,
      ).run(p.p_full_name ?? null, p.p_phone ?? null, p.p_email ?? null,
        new Date().toISOString(), p.p_user_id);
      return existing.id;
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO parent_accounts (id, user_id, full_name, phone, email, active)
       VALUES (?,?,?,?,?,1)`,
    ).run(id, p.p_user_id, p.p_full_name ?? null, p.p_phone ?? null, p.p_email ?? null);
    return id;
  },

  admin_link_parent_student(p, ctx) {
    const st = db.prepare('SELECT school_id FROM students WHERE id = ?').get(p.p_student_id);
    if (!st) throw new Error('Élève introuvable');
    const m = membership(ctx?.userId);
    if (!m || !['admin', 'censeur'].includes(m.role)) throw new Error('Non autorisé');
    // Contrôle de SECTEUR : un responsable Collège ne rattache pas un élève du
    // Primaire, exactement comme il ne peut pas le lire.
    if (!allowsStudent(loadScope(ctx.userId), p.p_student_id)) {
      throw new Error('Non autorisé sur cet élève');
    }
    if (!db.prepare('SELECT 1 FROM parent_accounts WHERE user_id = ? AND active = 1').get(p.p_parent_user_id)) {
      throw new Error('Compte parent introuvable ou désactivé');
    }
    const existing = db.prepare(
      'SELECT id FROM parent_student_links WHERE parent_user_id = ? AND student_id = ?',
    ).get(p.p_parent_user_id, p.p_student_id);
    if (existing) {
      db.prepare(
        `UPDATE parent_student_links
            SET active = 1, relationship = ?, is_primary = ?, revoked_at = NULL, revoked_by = NULL
          WHERE id = ?`,
      ).run(p.p_relationship || 'tuteur', p.p_is_primary ? 1 : 0, existing.id);
      return existing.id;
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO parent_student_links
              (id, parent_user_id, school_id, student_id, relationship, is_primary, active, created_by)
       VALUES (?,?,?,?,?,?,1,?)`,
    ).run(id, p.p_parent_user_id, st.school_id, p.p_student_id,
      p.p_relationship || 'tuteur', p.p_is_primary ? 1 : 0, ctx.userId);
    return id;
  },

  // Révocation, jamais suppression : « qui a vu quoi, jusqu'à quand » reste
  // établissable, comme pour les contre-passations de caisse.
  admin_revoke_parent_link(p, ctx) {
    const link = db.prepare('SELECT * FROM parent_student_links WHERE id = ?').get(p.p_link_id);
    if (!link) throw new Error('Lien introuvable');
    const m = membership(ctx?.userId);
    if (!m || !['admin', 'censeur'].includes(m.role)) throw new Error('Non autorisé');
    if (!allowsStudent(loadScope(ctx.userId), link.student_id)) throw new Error('Non autorisé');
    db.prepare(
      'UPDATE parent_student_links SET active = 0, revoked_at = ?, revoked_by = ? WHERE id = ?',
    ).run(new Date().toISOString(), ctx.userId, p.p_link_id);
    return null;
  },

  admin_list_parent_links(p, ctx) {
    const st = db.prepare('SELECT school_id FROM students WHERE id = ?').get(p.p_student_id);
    if (!st) return [];
    if (!allowsStudent(loadScope(ctx?.userId), p.p_student_id)) return [];
    return db.prepare(
      `SELECT l.id AS link_id, l.parent_user_id, a.full_name, a.phone, a.email,
              l.relationship, l.is_primary, l.active, l.created_at, l.revoked_at
         FROM parent_student_links l
         JOIN parent_accounts a ON a.user_id = l.parent_user_id
        WHERE l.student_id = ?
        ORDER BY l.active DESC, a.full_name`,
    ).all(p.p_student_id);
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
