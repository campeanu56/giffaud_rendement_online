/* Rendement Giffaud - Les Epesses / AgroForce Prestation
   V2 - samedi, notes de synthèse, liste produits complète, calendrier 2026.
   Logique métier reprise du fichier outil_rendement_bonus_malus_hebdo_sem.xlsm. */

const CONFIG = window.APP_CONFIG || {};
const DAYS = [
  { index: 1, name: "Lundi" },
  { index: 2, name: "Mardi" },
  { index: 3, name: "Mercredi" },
  { index: 4, name: "Jeudi" },
  { index: 5, name: "Vendredi" },
  { index: 6, name: "Samedi" }
];
const HOLIDAYS_2026 = {
  "2026-01-01": "Jour de l’An",
  "2026-04-06": "Lundi de Pâques",
  "2026-05-01": "Fête du Travail",
  "2026-05-08": "Victoire 1945",
  "2026-05-14": "Ascension",
  "2026-05-25": "Lundi de Pentecôte",
  "2026-07-14": "Fête nationale",
  "2026-08-15": "Assomption",
  "2026-11-01": "Toussaint",
  "2026-11-11": "Armistice 1918",
  "2026-12-25": "Noël"
};

let sb = null;
let session = null;
let profile = null;
let allProducts = [];
let products = [];
let sites = [];
let currentSite = null;
let currentWeekly = null;
let entries = [];
let quantities = [];
let profilesCache = [];
let lastSaveError = "";
let activeView = "dashboard";
let viewHistory = [];
function currentWeekdayFilter(){ const d = new Date().getDay() || 7; return DAYS.some(x => x.index === d) ? String(d) : "1"; }
let saisieDayFilter = currentWeekdayFilter();
let recapDayFilter = currentWeekdayFilter();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function initSupabase() {
  const badConfig = !CONFIG.supabaseUrl || CONFIG.supabaseUrl.includes("REMPLACER") || !CONFIG.supabaseAnonKey || CONFIG.supabaseAnonKey.includes("REMPLACER");
  if (badConfig) {
    $("#loginError").textContent = "Configuration Supabase absente. Ouvre config.js et renseigne supabaseUrl + supabaseAnonKey.";
    $("#loginError").classList.remove("hidden");
    return false;
  }
  sb = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  return true;
}

function showMessage(text, type = "info") {
  const box = $("#messageBox");
  box.textContent = text;
  box.className = type === "error" ? "message alert" : "message";
  box.classList.remove("hidden");
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => box.classList.add("hidden"), 4800);
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isoDate(date) {
  const d = new Date(date);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function dateForDay(weekStart, dayIndex) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex - 1);
  return isoDate(d);
}

function mondayFromIsoWeek(year, week) {
  const jan4 = new Date(year, 0, 4);
  const monday = mondayOf(jan4);
  monday.setDate(monday.getDate() + (Number(week) - 1) * 7);
  return monday;
}

function maxIsoWeek(year) {
  return getIsoWeek(new Date(year, 11, 28));
}

function weekRangeLabel(year, week) {
  const start = mondayFromIsoWeek(year, week);
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  const f = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return `${f(start)} au ${f(end)}`;
}

function setupWeekNumberSelector() {
  const weekInput = $("#weekStart");
  const wrap = document.querySelector(".week-selector");
  if (!weekInput || !wrap || $("#weekNumberSelect")) return;

  weekInput.style.display = "none";
  const year = new Date(weekInput.value || new Date()).getFullYear();
  const select = document.createElement("select");
  select.id = "weekNumberSelect";
  select.className = "week-number-select";

  const maxWeek = Math.max(52, maxIsoWeek(year));
  for (let w = 1; w <= maxWeek; w++) {
    const opt = document.createElement("option");
    opt.value = String(w);
    opt.textContent = `Semaine ${w} — ${weekRangeLabel(year, w)}`;
    select.appendChild(opt);
  }

  const label = wrap.querySelector("label");
  if (label) label.textContent = "N° de semaine";
  wrap.insertBefore(select, weekInput);
  syncWeekNumberSelector();

  select.addEventListener("change", async () => {
    const selectedYear = new Date(weekInput.value || new Date()).getFullYear();
    weekInput.value = isoDate(mondayFromIsoWeek(selectedYear, Number(select.value)));
    await loadWeek();
    renderAll();
  });
}

function syncWeekNumberSelector() {
  const weekInput = $("#weekStart");
  const select = $("#weekNumberSelect");
  const meta = $("#weekMeta");
  if (!weekInput || !select || !weekInput.value) return;
  const d = new Date(weekInput.value);
  const w = getIsoWeek(d);
  select.value = String(w);
  if (meta) meta.textContent = "";
}

function holidayName(dateStr) { return HOLIDAYS_2026[dateStr] || ""; }
function dayFullLabel(dayIndex) {
  const date = dateForDay($("#weekStart").value, dayIndex);
  const h = holidayName(date);
  return `${DAYS.find(d => d.index === dayIndex)?.name || "Jour"} ${date}${h ? " — " + h : ""}`;
}

function fmtNumber(v, digits = 1) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(v));
}
function fmtNumberLoose(v, digits = 2) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(Number(v));
}
function fmtPercent(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 }).format(Number(v));
}
function fmtEuro(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(v));
}
function toNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function escapeHtml(s) { return String(s || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function roleLabel(role) { return ({ admin: "Admin", responsable_afp: "Responsable AFP", responsable_giffaud: "Responsable Giffaud", lecture: "Lecture seule" })[role] || role || "-"; }
function defaultPermissionsByRole(role){
  const base = {view_dashboard:true, view_saisie:false, view_recap:true, view_synthese:true, manage_products:false, manage_users:false, manage_override:false};
  if(role==="admin") return {view_dashboard:true, view_saisie:true, view_recap:true, view_synthese:true, manage_products:true, manage_users:true, manage_override:true};
  if(role==="responsable_afp" || role==="responsable_giffaud") return {view_dashboard:true, view_saisie:true, view_recap:true, view_synthese:true, manage_products:false, manage_users:false, manage_override:false};
  return base;
}
function perms(){ return Object.assign(defaultPermissionsByRole(profile?.role), profile?.permissions || {}); }
function canEditSaisie() { return !!(profile && profile.active && perms().view_saisie); }
function canEditProducts() { return !!(profile && profile.active && perms().manage_products); }
function canEditUsers() { return !!(profile && profile.active && perms().manage_users); }
function canManageOverride() { return !!(profile && profile.active && perms().manage_override); }
function canView(view){ const p = perms(); const map={dashboard:p.view_dashboard,saisie:p.view_saisie,recapjour:p.view_recap,synthese:p.view_synthese,produits:p.manage_products,utilisateurs:p.manage_users}; return !!map[view]; }

async function login() {
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  $("#loginError").classList.add("hidden");
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $("#loginError").textContent = error.message;
    $("#loginError").classList.remove("hidden");
    return;
  }
  session = data.session;
  await afterLogin();
}

async function logout() {
  await sb.auth.signOut();
  session = null; profile = null;
  $("#loginView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
  $("#mainNav").classList.add("hidden");
  $("#logoutBtn").classList.add("hidden");
  $("#settingsBtn")?.classList.add("hidden");
  $("#settingsMenu")?.classList.add("hidden");
}

function ensurePasswordButton() {
  const footer = document.querySelector(".sidebar-footer");
  const logoutBtn = $("#logoutBtn");
  if (!footer || !logoutBtn) return;

  let box = $("#settingsBox");
  if (!box) {
    box = document.createElement("div");
    box.id = "settingsBox";
    box.className = "settings-box";
    box.innerHTML = `
      <button id="settingsBtn" class="ghost-btn settings-toggle" type="button">Paramètres</button>
      <div id="settingsMenu" class="settings-menu hidden">
        <button id="openPasswordBtn" type="button">Modifier mot de passe</button>
        <button id="settingsLogoutBtn" type="button">Déconnexion</button>
      </div>`;
    footer.insertBefore(box, logoutBtn);
    $("#settingsBtn").addEventListener("click", () => $("#settingsMenu")?.classList.toggle("hidden"));
    $("#openPasswordBtn").addEventListener("click", () => {
      $("#settingsMenu")?.classList.add("hidden");
      openPasswordModal();
    });
    $("#settingsLogoutBtn").addEventListener("click", logout);
  }

  $("#settingsBtn")?.classList.remove("hidden");
  $("#settingsMenu")?.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

function ensureAppControls() {
  const topbar = document.querySelector(".topbar");
  if (!topbar || $("#appQuickControls")) return;
  const controls = document.createElement("div");
  controls.id = "appQuickControls";
  controls.className = "app-quick-controls";
  controls.innerHTML = `
    <button type="button" id="appBackBtn" class="quick-control-btn">← Retour</button>
    <button type="button" id="appRefreshBtn" class="quick-control-btn">↻ Actualiser</button>
  `;
  topbar.prepend(controls);
  $("#appBackBtn").addEventListener("click", goBackApp);
  $("#appRefreshBtn").addEventListener("click", () => window.location.reload());
}

function goBackApp() {
  if (viewHistory.length) {
    const previous = viewHistory.pop();
    showView(previous, false);
  } else {
    showView("dashboard", false);
  }
}

function ensurePasswordModal() {
  if ($("#passwordModal")) return;
  const modal = document.createElement("div");
  modal.id = "passwordModal";
  modal.className = "password-modal hidden";
  modal.innerHTML = `
    <div class="password-card">
      <div class="card-header">
        <div>
          <h2>Modifier le mot de passe</h2>
          <p class="muted">Le changement concerne uniquement l'utilisateur connecté.</p>
        </div>
        <button id="closePasswordModal" class="secondary-btn small-btn">Fermer</button>
      </div>
      <label>Nouveau mot de passe
        <input id="newPasswordInput" type="password" autocomplete="new-password" placeholder="Nouveau mot de passe">
      </label>
      <label>Confirmer le mot de passe
        <input id="confirmPasswordInput" type="password" autocomplete="new-password" placeholder="Confirmer">
      </label>
      <div id="passwordError" class="alert hidden"></div>
      <div class="actions">
        <button id="savePasswordBtn" class="primary-btn">Enregistrer le nouveau mot de passe</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  $("#closePasswordModal").addEventListener("click", closePasswordModal);
  $("#savePasswordBtn").addEventListener("click", changeMyPassword);
}

function openPasswordModal() {
  ensurePasswordModal();
  $("#newPasswordInput").value = "";
  $("#confirmPasswordInput").value = "";
  $("#passwordError").classList.add("hidden");
  $("#passwordModal").classList.remove("hidden");
}

function closePasswordModal() {
  $("#passwordModal")?.classList.add("hidden");
}

async function changeMyPassword() {
  const p1 = $("#newPasswordInput").value;
  const p2 = $("#confirmPasswordInput").value;
  const err = $("#passwordError");
  err.classList.add("hidden");

  if (!p1 || p1.length < 8) {
    err.textContent = "Le mot de passe doit contenir au moins 8 caractères.";
    err.classList.remove("hidden");
    return;
  }
  if (p1 !== p2) {
    err.textContent = "Les deux mots de passe ne correspondent pas.";
    err.classList.remove("hidden");
    return;
  }

  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) {
    err.textContent = error.message;
    err.classList.remove("hidden");
    return;
  }

  closePasswordModal();
  showMessage("Mot de passe modifié.");
}

async function loadProfile() {
  const user = session.user;
  const { data, error } = await sb.from("gr_profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  if (!data || !data.active) throw new Error("Votre profil n'est pas actif. Demandez à l'admin de l'activer dans Supabase / gr_profiles.");
  profile = data;
}

async function afterLogin() {
  try {
    await loadProfile();
    $("#loginView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#mainNav").classList.remove("hidden");
    $("#logoutBtn").classList.add("hidden");
    $("#userInfo").classList.remove("hidden");
    $("#userInfo").innerHTML = `<strong>${escapeHtml(profile.full_name || profile.email)}</strong><br>${roleLabel(profile.role)}`;
    $$(".admin-only").forEach(el => el.style.display = (canEditProducts() || canEditUsers() || canManageOverride()) ? "" : "none");
    ensurePasswordButton();
    ensureAppControls();
    await loadInitialData();
  } catch (err) {
    $("#loginError").textContent = err.message;
    $("#loginError").classList.remove("hidden");
    await sb.auth.signOut();
  }
}

async function loadInitialData() {
  $("#weekStart").value = isoDate(mondayOf(new Date()));
  setupWeekNumberSelector();
  syncWeekNumberSelector();
  saisieDayFilter = currentWeekdayFilter();
  recapDayFilter = currentWeekdayFilter();
  await loadSitesProducts();
  await loadWeek();
  renderAll();
}

async function loadSitesProducts() {
  let { data: siteRows, error: siteErr } = await sb.from("gr_sites").select("*").order("created_at");
  if (siteErr) throw siteErr;
  sites = siteRows || [];
  currentSite = sites.find(s => s.name === CONFIG.siteName) || sites[0];
  if (!currentSite) throw new Error("Aucun site trouvé. Exécute d'abord supabase/gr_schema.sql.");

  let { data: productRows, error: productErr } = await sb.from("gr_products").select("*").order("sort_order");
  if (productErr) throw productErr;
  allProducts = productRows || [];
  products = allProducts.filter(p => p.active !== false);
}

async function loadWeek() {
  const weekStart = $("#weekStart").value;
  const d = new Date(weekStart);
  const year = d.getFullYear();
  const isoWeek = getIsoWeek(d);

  let { data: header, error } = await sb.from("gr_weekly_headers")
    .select("*")
    .eq("site_id", currentSite.id)
    .eq("week_start_date", weekStart)
    .maybeSingle();
  if (error) throw error;
  if (!header && canEditSaisie()) {
    const ins = {
      site_id: currentSite.id,
      week_start_date: weekStart,
      iso_week: isoWeek,
      year,
      client_name: CONFIG.clientName,
      prestataire_name: CONFIG.prestataireName,
      status: "brouillon",
      locked: false,
      created_by: session.user.id
    };
    const res = await sb.from("gr_weekly_headers").insert(ins).select("*").single();
    if (res.error) throw res.error;
    header = res.data;
  }
  currentWeekly = header;
  if (!currentWeekly) { entries = []; quantities = []; return; }

  const ent = await sb.from("gr_control_entries").select("*").eq("weekly_id", currentWeekly.id);
  if (ent.error) throw ent.error;
  entries = ent.data || [];

  const qty = await sb.from("gr_weekly_product_quantities").select("*").eq("weekly_id", currentWeekly.id);
  if (qty.error) throw qty.error;
  quantities = qty.data || [];
}

function getEntry(productId, dayIndex) { return entries.find(e => e.product_id === productId && e.day_index === dayIndex) || null; }
function getQuantity(productId) { return quantities.find(q => q.product_id === productId) || null; }

function calcEntry(product, entry, dayIndex) {
  const qteComptee = entry ? toNum(entry.qte_comptee) : null;
  const poids = entry ? toNum(entry.poids_total_g) : null;
  const qteRef = Number(product.qte_ref || 10);
  const rendementRef = Number(product.rendement_ref_g) * (dayIndex === 1 ? Number(product.coefficient_lundi || 1) : 1);
  const rendementReel = qteComptee && poids !== null ? poids / qteComptee : null;
  const ecart = rendementReel !== null && rendementRef ? rendementReel / rendementRef - 1 : null;

  // Par défaut, les responsables sont considérés présents. Une ligne n'est "saisie"
  // que s'il y a une quantité, un poids, un commentaire, une absence indiquée ou un déblocage.
  const presenceAfp = entry && entry.presence_afp !== undefined ? !!entry.presence_afp : true;
  const presenceGiffaud = entry && entry.presence_giffaud !== undefined ? !!entry.presence_giffaud : true;
  const adminOverride = entry ? !!entry.admin_override : false;
  const hasComment = !!(entry && (entry.commentaire_terrain || entry.override_reason));
  const qteNonConforme = entry ? toNum(entry.qte_non_conforme) : null;
  const hasAbsence = !!(entry && (entry.presence_afp === false || entry.presence_giffaud === false));
  const hasInput = qteComptee !== null || poids !== null || adminOverride || hasComment || hasAbsence;

  let conformeBase = null, conforme = null, commentaire = "", note = null, resultat = "";

  if (hasInput) {
    conformeBase = qteComptee === qteRef && presenceAfp && presenceGiffaud;
    conforme = conformeBase || adminOverride;
    if (conformeBase) commentaire = "Rendement exploitable";
    else {
      const reasons = [];
      if (qteComptee !== qteRef) reasons.push("quantité de pièces non respectée");
      if (!presenceAfp) reasons.push("responsable AFP non présent");
      if (!presenceGiffaud) reasons.push("responsable Giffaud non présent");
      commentaire = "Rendement non conforme : " + reasons.join(" ; ");
      if (adminOverride) commentaire += " — déblocage admin" + (entry?.override_reason ? " : " + entry.override_reason : "");
    }
  }

  if (rendementReel !== null) {
    if (rendementReel < rendementRef * (1 - Number(product.seuil_bonus_3))) note = Number(product.bonus_3);
    else if (rendementReel < rendementRef * (1 - Number(product.seuil_bonus_2))) note = Number(product.bonus_2);
    else if (rendementReel < rendementRef * (1 - Number(product.tolerance_basse))) note = Number(product.bonus_1);
    else if (rendementReel <= rendementRef * (1 + Number(product.tolerance_haute))) note = 0;
    else if (rendementReel <= rendementRef * (1 + Number(product.seuil_malus_1))) note = Number(product.malus_1);
    else if (rendementReel <= rendementRef * (1 + Number(product.seuil_malus_2))) note = Number(product.malus_2);
    else if (rendementReel <= rendementRef * (1 + Number(product.seuil_malus_3))) note = Number(product.malus_3);
    else note = Number(product.malus_4);
  }

  if (hasInput) {
    if (!conforme) resultat = "Non exploitable";
    else if (adminOverride && !conformeBase) resultat = "Débloqué admin";
    else if (note > 0) resultat = "Bonus";
    else if (note < 0) resultat = "Malus";
    else resultat = "Neutre";
  }
  return { qteRef, rendementRef, rendementReel, ecart, conforme, conformeBase, adminOverride, commentaire, note, resultat, hasInput, presenceAfp, presenceGiffaud };
}

function calcSummary() {
  return products.map(product => {
    const calcs = DAYS.map(d => ({ day: d, entry: getEntry(product.id, d.index), calc: calcEntry(product, getEntry(product.id, d.index), d.index) }));
    const entered = calcs.filter(x => x.calc.rendementReel !== null);
    const nonConformes = calcs.filter(x => x.calc.hasInput && x.calc.conforme === false).length;
    const conformes = calcs.filter(x => x.calc.conforme === true && x.calc.rendementReel !== null);

    // Calcul interne normalisé : chaque journée est comparée à sa propre référence.
    // Le lundi conserve donc sa référence majorée avec coefficient 1,20.
    const moyenne = entered.length ? entered.reduce((s, x) => s + x.calc.rendementReel, 0) / entered.length : null;
    const refHebdo = conformes.length ? conformes.reduce((s, x) => s + x.calc.rendementRef, 0) / conformes.length : null;
    const ecartMoyen = conformes.length ? conformes.reduce((s, x) => s + x.calc.ecart, 0) / conformes.length : null;

    const qteNonConforme = calcs.reduce((s, x) => s + (Number(toNum(x.entry?.qte_non_conforme)) || 0), 0);
    const deductionNonConforme = qteNonConforme * 3;

    const semaineConforme = entered.length > 0 && nonConformes === 0;
    let taux = null;
    if (semaineConforme && ecartMoyen !== null) {
      if (ecartMoyen < -Number(product.seuil_bonus_3)) taux = Number(product.bonus_3);
      else if (ecartMoyen < -Number(product.seuil_bonus_2)) taux = Number(product.bonus_2);
      else if (ecartMoyen < -Number(product.tolerance_basse)) taux = Number(product.bonus_1);
      else if (ecartMoyen <= Number(product.tolerance_haute)) taux = 0;
      else if (ecartMoyen <= Number(product.seuil_malus_1)) taux = Number(product.malus_1);
      else if (ecartMoyen <= Number(product.seuil_malus_2)) taux = Number(product.malus_2);
      else if (ecartMoyen <= Number(product.seuil_malus_3)) taux = Number(product.malus_3);
      else taux = Number(product.malus_4);
    }

    const qte = getQuantity(product.id);
    const qteTravaille = qte ? toNum(qte.qte_travaille) : null;
    const qteBonusMalusBrut = taux !== null && qteTravaille !== null ? qteTravaille * taux : null;
    const qteBonusMalus = (qteBonusMalusBrut !== null ? qteBonusMalusBrut : 0) - deductionNonConforme;
    const euros = qteBonusMalus !== null ? qteBonusMalus * Number(product.prix_unitaire_eur || 0) : null;
    const commentaire = !entered.length ? (qteNonConforme ? "Produits non conformes saisis" : "Aucune saisie") : (semaineConforme ? "Semaine conforme" : `Semaine non conforme - bonus/malus rendement non applicable (${nonConformes} jour(s))`);
    return { product, calcs, entered, moyenne, nonConformes, semaineConforme, refHebdo, ecartMoyen, taux, qteTravaille, qteBonusMalusBrut, qteNonConforme, deductionNonConforme, qteBonusMalus, euros, commentaire, commentaireSynthese: qte?.commentaire_synthese || "" };
  });
}

function dashboardMetrics(summary) {
  const lignesSaisies = summary.reduce((s, p) => s + p.entered.length, 0);
  const lignesNonConformes = summary.reduce((s, p) => s + p.nonConformes, 0);
  const nbBonus = summary.filter(p => p.taux > 0).length;
  const nbMalus = summary.filter(p => p.taux < 0).length;
  const nbNeutre = summary.filter(p => p.taux === 0).length;
  return { lignesSaisies, lignesNonConformes, nbBonus, nbMalus, nbNeutre };
}

function dailySummary(dayIndex) {
  const rows = products.map(product => {
    const entry = getEntry(product.id, dayIndex);
    return { product, entry, calc: calcEntry(product, entry, dayIndex) };
  });
  const saisies = rows.filter(r => r.calc.hasInput).length;
  const conformes = rows.filter(r => r.calc.conforme === true).length;
  const nonConformes = rows.filter(r => r.calc.hasInput && r.calc.conforme === false).length;
  const bonus = rows.filter(r => r.calc.conforme === true && r.calc.note > 0).length;
  const malus = rows.filter(r => r.calc.conforme === true && r.calc.note < 0).length;
  return { rows, saisies, conformes, nonConformes, bonus, malus };
}
function recapAllDaysSummary(){
  const summary = calcSummary();
  const rows = summary.map(p => ({
    product:p.product,
    enteredDays:p.entered.length,
    moyenne:p.moyenne,
    refHebdo:p.refHebdo,
    ecartMoyen:p.ecartMoyen,
    nonConformes:p.nonConformes,
    taux:p.taux,
    commentaire:p.commentaire
  }));
  return {
    rows,
    saisies: rows.reduce((s,r)=>s+r.enteredDays,0),
    conformes: rows.filter(r=>r.enteredDays>0 && r.nonConformes===0).length,
    nonConformes: rows.filter(r=>r.nonConformes>0).length,
    bonus: rows.filter(r=>r.taux>0).length,
    malus: rows.filter(r=>r.taux<0).length
  };
}

function renderAll() {
  renderDashboard(); renderSaisie(); renderRecapJour(); renderSynthese(); renderProduits(); renderUtilisateurs();
  showView(activeView);
}

function setTitles(title) {
  $("#pageTitle").textContent = title;
  const week = $("#weekStart").value;
  const weekNo = week ? getIsoWeek(new Date(week)) : "-";
  $("#pageSubtitle").textContent = `${CONFIG.clientName} - ${CONFIG.siteName} / ${CONFIG.prestataireName} — semaine ${weekNo} du ${week}`;
  syncWeekNumberSelector();
}
function syncWeekSelectorVisibility(view){
  const ws = document.querySelector('.week-selector');
  if(!ws) return;
  ws.style.display = ["dashboard","saisie","recapjour","synthese"].includes(view) ? "grid" : "none";
}
function showView(view, pushHistory = true) {
  if(!canView(view)) view = canView("dashboard") ? "dashboard" : (canView("recapjour") ? "recapjour" : "synthese");
  if (pushHistory && activeView && activeView !== view) {
    viewHistory.push(activeView);
    if (viewHistory.length > 8) viewHistory.shift();
  }
  activeView = view;
  $$(".view").forEach(v => v.classList.remove("active-view"));
  const node = $(`#${view}`);
  if (node) node.classList.add("active-view");
  $$(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.view === view);
    b.style.display = canView(b.dataset.view) ? "" : "none";
  });
  syncWeekSelectorVisibility(view);
  setTitles(({ dashboard: "Tableau de bord", saisie: "Saisie rendement", recapjour: "Récapitulatif journalier", synthese: "Synthèse finale", produits: "Liste produits", utilisateurs: "Utilisateurs" })[view] || "Application");
}

function badgeStatus(text, isOk, enteredCount) {
  if (!enteredCount) return `<span class="badge badge-neutral">Aucune saisie</span>`;
  return `<span class="badge ${isOk ? "badge-ok" : "badge-bad"}">${isOk ? "Conforme" : "Non conforme"}</span>`;
}

function viewActions(sectionId, fileName) {
  return `<div class="actions export-actions">
    <button class="secondary-btn" onclick="printSection('${sectionId}')">Imprimer / PDF</button>
    <button class="secondary-btn" onclick="exportSectionTables('${sectionId}', '${fileName}')">Exporter Excel</button>
  </div>`;
}

function cleanCloneForExport(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll("button, .actions, .day-filter, .mobile-saisie-list").forEach(el => el.remove());
  clone.querySelectorAll("input, textarea, select").forEach(el => {
    const span = document.createElement("span");
    if (el.tagName === "SELECT") {
      span.textContent = el.options[el.selectedIndex]?.text || "";
    } else {
      span.textContent = el.value || "";
    }
    el.replaceWith(span);
  });
  return clone;
}

function exportSectionTables(sectionId, fileName) {
  const section = document.getElementById(sectionId);
  if (!section) return showMessage("Tableau introuvable pour l'export.", "error");
  const clone = cleanCloneForExport(section);
  const tables = [...clone.querySelectorAll("table")];
  if (!tables.length) return showMessage("Aucun tableau à exporter.", "error");
  const title = document.getElementById("pageTitle")?.textContent || fileName;
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><h1>${escapeHtml(title)}</h1>${tables.map(t => t.outerHTML).join("<br><br>")}</body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName}_semaine_${getIsoWeek(new Date($("#weekStart").value))}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function printSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return showMessage("Document introuvable pour l'impression.", "error");

  const clone = cleanCloneForExport(section);
  clone.querySelectorAll(".card").forEach(card => {
    const tables = card.querySelectorAll("table");
    if (!tables.length) card.remove();
  });

  const title = document.getElementById("pageTitle")?.textContent || "Document";
  const week = $("#weekStart")?.value || "";
  const weekNo = week ? getIsoWeek(new Date(week)) : "";
  const htmlContent = clone.innerHTML;

  const win = window.open("", "_blank");
  if (!win) return showMessage("La fenêtre d'impression a été bloquée par le navigateur.", "error");

  win.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} - semaine ${weekNo}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #151515; margin: 0; background: #fff; }
  .print-header { border-bottom: 3px solid #982735; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { margin: 0; font-size: 18px; color: #982735; }
  .subtitle { font-size: 10px; color: #444; margin-top: 3px; }
  .card { border: 0; padding: 0; margin: 0; box-shadow: none; }
  .card + .card { margin-top: 8px; }
  .card-header, .actions, .day-filter, .note-box, .muted, .inline-note, textarea { display: none !important; }
  .table-wrap { overflow: visible; border: 1px solid #ddd; border-radius: 6px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.4px; page-break-inside: avoid; }
  th, td { border: 1px solid #ddd; padding: 3px 4px; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #2b201b; color: #fff; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  tr { page-break-inside: avoid; }
  input, select, span, div { font-size: inherit; }
  .badge { display: inline-block; border-radius: 8px; padding: 1px 4px; font-weight: 700; border: 1px solid #ddd; }
  .badge-ok { background: #e9f8ef; color: #116b3a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge-bad { background: #fde8e8; color: #9f1b1b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge-neutral { background: #f1f5f9; color: #334155; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .small { color: #555; }
  .product-cell { font-weight: 700; }
</style>
</head>
<body>
  <div class="print-header">
    <h1>${escapeHtml(title)}</h1>
    <div class="subtitle">Maison Giffaud - Les Epesses / AgroForce Prestation — semaine ${weekNo} du ${week}</div>
  </div>
  ${htmlContent}
<script>
window.onload = () => { window.focus(); window.print(); };
</script>
</body>
</html>`);
  win.document.close();
}

function resultBadgeHtml(taux, fallback = "-") {
  if (taux === null || taux === undefined || Number.isNaN(Number(taux))) return `<span class="badge badge-neutral">${escapeHtml(fallback || "-")}</span>`;
  if (Number(taux) > 0) return `<span class="badge badge-bonus">Bonus ${fmtPercent(taux)}</span>`;
  if (Number(taux) < 0) return `<span class="badge badge-malus">Malus ${fmtPercent(taux)}</span>`;
  return `<span class="badge badge-neutre">Neutre</span>`;
}

function fmtSignedGram(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNumber(n)} g`;
}

function diffBadgeHtml(diff) {
  if (diff === null || diff === undefined || Number.isNaN(Number(diff))) return `<span class="badge badge-neutral">-</span>`;
  if (Number(diff) < 0) return `<span class="badge badge-bonus">${fmtSignedGram(diff)}</span>`;
  if (Number(diff) > 0) return `<span class="badge badge-malus">${fmtSignedGram(diff)}</span>`;
  return `<span class="badge badge-neutre">0 g</span>`;
}

function dashboardMotivationMessage({ totalSaisies, tauxNonConformite, produitsProbleme, produitsMalus, produitsBonus }) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";
  const day = new Date().toLocaleDateString("fr-FR", { weekday: "long" });
  const problemNames = produitsProbleme.slice(0, 3).map(p => p.product.name).join(", ");

  if (!totalSaisies) {
    return {
      level: "neutral",
      title: `${hello}, prêt pour la journée de ${day}.`,
      text: "Aucune saisie pour le moment. L’objectif est simple : contrôler proprement, valider chaque journée et garder une synthèse claire en fin de semaine."
    };
  }

  if ((tauxNonConformite || 0) >= 0.25 || produitsMalus.length >= 2) {
    return {
      level: "alert",
      title: `${hello}, semaine sous vigilance.`,
      text: `Plusieurs points demandent une attention particulière${problemNames ? ` : ${problemNames}` : ""}. On reprend produit par produit, on corrige les écarts et on sécurise les prochaines saisies.`
    };
  }

  if (produitsProbleme.length || produitsMalus.length) {
    return {
      level: "warn",
      title: `${hello}, il y a quelques points à surveiller.`,
      text: `${problemNames ? `Priorité sur : ${problemNames}. ` : ""}Rien d’insurmontable : on vérifie les produits concernés et on garde le rythme.`
    };
  }

  if (produitsBonus.length) {
    return {
      level: "success",
      title: `${hello}, très bon suivi cette semaine.`,
      text: "Les contrôles sont propres et certains produits sont en bonus. Continuez comme ça, la régularité fait la différence."
    };
  }

  return {
    level: "neutral",
    title: `${hello}, semaine maîtrisée.`,
    text: "Les données sont stables. On continue à saisir précisément pour garder une lecture fiable jusqu’à la synthèse finale."
  };
}

function renderDashboard() {
  const summary = calcSummary();
  const m = dashboardMetrics(summary);
  const weekStart = $("#weekStart").value;
  const weekNo = getIsoWeek(new Date(weekStart));
  const totalSaisies = Math.max(0, m.lignesSaisies);
  const conformes = Math.max(0, totalSaisies - m.lignesNonConformes);
  const tauxConformite = totalSaisies ? conformes / totalSaisies : null;
  const tauxNonConformite = totalSaisies ? m.lignesNonConformes / totalSaisies : null;
  const produitsProbleme = summary.filter(p => p.nonConformes > 0 || p.taux < 0 || p.qteNonConforme > 0);
  const produitsBonus = summary.filter(p => p.taux > 0);
  const produitsMalus = summary.filter(p => p.taux < 0);

  const productRows = summary.map(p => {
    const entered = p.entered.length;
    const pct = entered ? (entered - p.nonConformes) / entered : null;
    let status = "Aucune saisie";
    if (p.nonConformes > 0) status = "Non conforme";
    else if (p.taux < 0) status = "Malus rendement";
    else if (p.taux > 0) status = "Bonus rendement";
    else if (entered > 0) status = "Conforme";
    else if (p.qteNonConforme > 0) status = "Pièces NC";
    const tendance = p.taux > 0 ? `Bonus ${fmtPercent(p.taux)}` : p.taux < 0 ? `Malus ${fmtPercent(p.taux)}` : p.taux === 0 ? "Neutre" : (p.qteNonConforme > 0 ? "Déduction NC" : "-");
    const diff = p.moyenne !== null && p.refHebdo !== null ? p.moyenne - p.refHebdo : null;
    const detailsJour = p.calcs
      .filter(x => x.calc.rendementReel !== null)
      .map(x => `${x.day.name.slice(0, 3)} ${fmtNumber(x.calc.rendementReel)}g`)
      .join(" · ");
    return { p, entered, pct, status, tendance, diff, detailsJour };
  });

  $("#dashboard").innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><span>Conformité semaine</span><strong>${tauxConformite === null ? "-" : fmtPercent(tauxConformite)}</strong></div>
      <div class="kpi"><span>Non-conformité</span><strong>${tauxNonConformite === null ? "-" : fmtPercent(tauxNonConformite)}</strong></div>
      <div class="kpi"><span>Produits à problème</span><strong>${produitsProbleme.length}</strong></div>
      <div class="kpi"><span>Bonus / Malus</span><strong>${produitsBonus.length} / ${produitsMalus.length}</strong></div>
    </div>
    ${(() => { const msg = dashboardMotivationMessage({ totalSaisies, tauxNonConformite, produitsProbleme, produitsMalus, produitsBonus }); return `<div class="dashboard-motivation ${msg.level}"><strong>${escapeHtml(msg.title)}</strong><span>${escapeHtml(msg.text)}</span></div>`; })()}
    <div class="card">
      <div class="card-header"><h2>Semaine ${weekNo}</h2><div>${viewActions('dashboard', 'tableau_de_bord')}<span class="badge ${totalSaisies === 0 ? "badge-neutral" : m.lignesNonConformes ? "badge-bad" : "badge-ok"}">${totalSaisies === 0 ? "Aucune saisie" : m.lignesNonConformes ? "Contrôle à revoir" : "Semaine conforme"}</span></div></div>
      <div class="note-box compact-rule"><strong>Règle :</strong> lundi coefficient 1,20. Une journée non conforme bloque le produit sur la semaine, sauf déblocage admin.</div>
      ${produitsProbleme.length ? `<p class="dashboard-alert"><strong>Produits à surveiller :</strong> ${produitsProbleme.map(x => escapeHtml(x.product.name)).join(", ")}</p>` : ""}
      ${currentWeekly?.week_note ? `<div class="note-box" style="margin-top:10px;"><strong>Note de synthèse :</strong> ${escapeHtml(currentWeekly.week_note)}</div>` : ""}
    </div>
    <div class="card">
      <div class="card-header"><h2>Suivi par produit</h2></div>
      <div class="dashboard-mobile-products">
        ${productRows.map(r => `<article class="dashboard-product-card ${r.p.taux > 0 ? "is-bonus" : r.p.taux < 0 || r.status === "À revoir" ? "is-malus" : "is-neutral"}">
          <div class="dashboard-product-head">
            <strong>${escapeHtml(r.p.product.name)}</strong>
            ${resultBadgeHtml(r.p.taux, r.tendance)}
          </div>
          <div class="dashboard-product-grid">
            <div><span>Constaté</span><strong>${fmtNumber(r.p.moyenne)} g</strong></div>
            <div><span>Réf.</span><strong>${fmtNumber(r.p.refHebdo)} g</strong></div>
            <div><span>Diff.</span><strong>${diffBadgeHtml(r.diff)}</strong></div>
            <div><span>% conformité</span><strong>${r.pct === null ? "-" : fmtPercent(r.pct)}</strong></div>
            <div><span>Jours saisis</span><strong>${r.entered}</strong></div>
            <div><span>Non conformes</span><strong>${r.p.nonConformes}</strong></div>
          </div>
          ${r.detailsJour ? `<div class="dashboard-day-values"><span>Jours relevés</span><strong>${escapeHtml(r.detailsJour)}</strong></div>` : ""}
          <div class="dashboard-product-status">
            <span class="badge ${["Conforme","Bonus rendement"].includes(r.status) ? "badge-ok" : ["Non conforme","Malus rendement"].includes(r.status) ? "badge-bad" : r.status === "Pièces NC" ? "badge-warn" : "badge-neutral"}">${r.status}</span>
          </div>
        </article>`).join("")}
      </div>
      <div class="table-wrap dashboard-desktop-table"><table><thead><tr><th>Produit</th><th>Jours saisis</th><th>% conformité</th><th>Jours non conformes</th><th>Rendement constaté</th><th>Réf. hebdo utilisée</th><th>Diff.</th><th>Pièces NC</th><th>Déduction NC</th><th>Résultat semaine</th><th>Jours relevés</th><th>Statut</th></tr></thead><tbody>
        ${productRows.map(r => `<tr>
          <td class="product-cell">${escapeHtml(r.p.product.name)}</td>
          <td>${r.entered}</td>
          <td><strong>${r.pct === null ? "-" : fmtPercent(r.pct)}</strong></td>
          <td>${r.p.nonConformes}</td>
          <td>${fmtNumber(r.p.moyenne)} g</td>
          <td>${fmtNumber(r.p.refHebdo)} g</td>
          <td>${diffBadgeHtml(r.diff)}</td>
          <td>${fmtNumberLoose(r.p.qteNonConforme, 0)}</td>
          <td>${r.p.deductionNonConforme ? `-${fmtNumberLoose(r.p.deductionNonConforme, 0)}` : "-"}</td>
          <td>${resultBadgeHtml(r.p.taux, r.tendance)}</td>
          <td class="small">${escapeHtml(r.detailsJour || "-")}</td>
          <td><span class="badge ${["Conforme","Bonus rendement"].includes(r.status) ? "badge-ok" : ["Non conforme","Malus rendement"].includes(r.status) ? "badge-bad" : r.status === "Pièces NC" ? "badge-warn" : "badge-neutral"}">${r.status}</span></td>
        </tr>`).join("")}
      </tbody></table></div>
    </div>`;
}

function dayFilterHtml(id, current) {
  return `<div class="day-filter"><label>Journée affichée<select id="${id}"><option value="all" ${current === "all" ? "selected" : ""}>Tous les jours</option>${DAYS.map(d => `<option value="${d.index}" ${current === String(d.index) ? "selected" : ""}>${dayFullLabel(d.index)}</option>`).join("")}</select></label></div>`;
}


function lockedDaysObj() {
  const v = currentWeekly?.locked_days;
  if (!v) return {};
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return v || {};
}

function isDayLocked(dayIndex) {
  return !!lockedDaysObj()[String(dayIndex)];
}

function dayLockBadge(dayIndex) {
  if (currentWeekly?.locked) return `<span class="badge badge-ok">Semaine validée</span>`;
  return isDayLocked(dayIndex) ? `<span class="badge badge-ok">Journée validée</span>` : `<span class="badge badge-neutral">Journée modifiable</span>`;
}

function visibleField(productId, dayIndex, field) {
  return $$(`[data-field="${field}"][data-product="${productId}"][data-day="${dayIndex}"]`).find(el => el.offsetParent !== null) || null;
}

function readLiveEntry(productId, dayIndex) {
  const read = (field) => visibleField(productId, dayIndex, field);
  const qte = read("qte_comptee");
  const poids = read("poids_total_g");
  const qteNc = read("qte_non_conforme");
  const afp = read("presence_afp");
  const giffaud = read("presence_giffaud");
  const comment = read("commentaire_terrain");
  const override = read("admin_override");
  const reason = read("override_reason");
  return {
    qte_comptee: qte ? qte.value : "",
    poids_total_g: poids ? poids.value : "",
    qte_non_conforme: qteNc ? qteNc.value : "",
    presence_afp: afp ? afp.value === "true" : true,
    presence_giffaud: giffaud ? giffaud.value === "true" : true,
    commentaire_terrain: comment ? comment.value : "",
    admin_override: override ? override.value === "true" : false,
    override_reason: reason ? reason.value : ""
  };
}

function dayResultHtml(c) {
  if (!c.hasInput || !c.resultat) return "-";
  const note = c.note === null || c.note === undefined ? "" : ` ${fmtPercent(c.note)}`;
  if (c.resultat === "Bonus") return `<span class="badge badge-bonus">Bonus${note}</span>`;
  if (c.resultat === "Malus") return `<span class="badge badge-malus">Malus${note}</span>`;
  if (c.resultat === "Neutre") return `<span class="badge badge-neutre">Neutre</span>`;
  if (c.resultat === "Débloqué admin") return `<span class="badge badge-warn">Débloqué admin${note}</span>`;
  return `<span class="badge badge-bad">${escapeHtml(c.resultat)}</span>`;
}

function statusHtml(c) {
  if (!c.hasInput) return `<span class="badge badge-neutral">-</span>`;
  if (c.conforme) return `<span class="badge ${c.adminOverride && !c.conformeBase ? "badge-warn" : "badge-ok"}">${c.adminOverride && !c.conformeBase ? "Débloqué admin" : "Conforme"}</span>`;
  return `<span class="badge badge-bad">Non conforme</span>`;
}

function updateLiveSaisieRow(productId, dayIndex) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const entry = readLiveEntry(productId, dayIndex);
  const c = calcEntry(product, entry, Number(dayIndex));
  $$(`[data-live-real="${productId}-${dayIndex}"]`).forEach(el => el.textContent = `${fmtNumber(c.rendementReel)} g`);
  $$(`[data-live-status="${productId}-${dayIndex}"]`).forEach(el => el.innerHTML = `${statusHtml(c)}<br><span class="small">${escapeHtml(c.commentaire)}</span>`);
  $$(`[data-live-note="${productId}-${dayIndex}"]`).forEach(el => el.textContent = fmtPercent(c.note));
  $$(`[data-live-result="${productId}-${dayIndex}"]`).forEach(el => el.innerHTML = dayResultHtml(c));
  $$(`[data-live-mobile-badge="${productId}-${dayIndex}"]`).forEach(el => el.innerHTML = c.hasInput ? (c.conforme ? `<span class="badge ${c.adminOverride && !c.conformeBase ? "badge-warn" : "badge-ok"}">${c.adminOverride && !c.conformeBase ? "Débloqué" : "OK"}</span>` : `<span class="badge badge-bad">Non conforme</span>`) : `<span class="badge badge-neutral">-</span>`);
}

function attachSaisieLiveListeners() {
  $$('[data-field]').forEach(el => {
    const fn = () => updateLiveSaisieRow(el.dataset.product, el.dataset.day);
    el.addEventListener("input", fn);
    el.addEventListener("change", fn);
  });
}



function renderSaisie() {
  if (!DAYS.some(d => String(d.index) === saisieDayFilter)) saisieDayFilter = currentWeekdayFilter();
  const visibleDays = DAYS.filter(d => String(d.index) === saisieDayFilter);
  const selectedDayIndex = Number(saisieDayFilter);
  const dayLocked = isDayLocked(selectedDayIndex);
  const weekLocked = !!(currentWeekly && currentWeekly.locked);
  const disabled = !canEditSaisie() || dayLocked || weekLocked;

  const showOverride = canManageOverride() && visibleDays.some(d =>
    products.some(product => {
      const entry = getEntry(product.id, d.index) || {};
      const c = calcEntry(product, entry, d.index);
      return c.hasInput && c.conformeBase === false;
    })
  );

  const rows = [];
  const cards = [];
  for (const d of visibleDays) {
    for (const product of products) {
      const entry = getEntry(product.id, d.index) || {};
      const c = calcEntry(product, entry, d.index);
      const date = dateForDay($("#weekStart").value, d.index);
      const key = `${product.id}-${d.index}`;
      const overrideCells = showOverride ? (
        c.hasInput && c.conformeBase === false
          ? `<td><select data-field="admin_override" data-product="${product.id}" data-day="${d.index}"><option value="false">Non débloqué</option><option value="true" ${entry.admin_override ? "selected" : ""}>Débloqué</option></select></td><td><input data-field="override_reason" data-product="${product.id}" data-day="${d.index}" value="${escapeHtml(entry.override_reason || "")}" placeholder="Motif du déblocage"></td>`
          : `<td class="small">-</td><td class="small">-</td>`
      ) : "";

      rows.push(`<tr class="${product.sort_order === 1 ? "day-separator" : ""}">
        <td><strong>${d.name}</strong><br><span class="small">${date}</span>${holidayName(date) ? `<br><span class="badge badge-holiday">${holidayName(date)}</span>` : ""}</td>
        <td class="product-cell">${escapeHtml(product.name)}</td>
        <td>${c.qteRef}</td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="1" min="0" data-field="qte_comptee" data-product="${product.id}" data-day="${d.index}" value="${entry.qte_comptee ?? ""}"></td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="0.01" min="0" data-field="poids_total_g" data-product="${product.id}" data-day="${d.index}" value="${entry.poids_total_g ?? ""}"></td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="1" min="0" data-field="qte_non_conforme" data-product="${product.id}" data-day="${d.index}" value="${Number(entry.qte_non_conforme || 0) > 0 ? entry.qte_non_conforme : ""}" placeholder="0"></td>
        <td><select ${disabled ? "disabled" : ""} data-field="presence_afp" data-product="${product.id}" data-day="${d.index}"><option value="true" ${entry.presence_afp !== false ? "selected" : ""}>Présent</option><option value="false" ${entry.presence_afp === false ? "selected" : ""}>Non présent</option></select></td>
        <td><select ${disabled ? "disabled" : ""} data-field="presence_giffaud" data-product="${product.id}" data-day="${d.index}"><option value="true" ${entry.presence_giffaud !== false ? "selected" : ""}>Présent</option><option value="false" ${entry.presence_giffaud === false ? "selected" : ""}>Non présent</option></select></td>
        <td>${fmtNumber(c.rendementRef)} g</td>
        <td data-live-real="${key}">${fmtNumber(c.rendementReel)} g</td>
        <td data-live-status="${key}">${statusHtml(c)}<br><span class="small">${escapeHtml(c.commentaire)}</span></td>
        <td data-live-result="${key}">${dayResultHtml(c)}</td>
        <td><input ${disabled ? "disabled" : ""} data-field="commentaire_terrain" data-product="${product.id}" data-day="${d.index}" value="${escapeHtml(entry.commentaire_terrain || "")}" placeholder="Commentaire"></td>
        ${overrideCells}
      </tr>`);

      const overrideMobile = showOverride && c.hasInput && c.conformeBase === false ? `
        <div class="mobile-field">
          <label>Déblocage admin</label>
          <select data-field="admin_override" data-product="${product.id}" data-day="${d.index}">
            <option value="false">Non débloqué</option>
            <option value="true" ${entry.admin_override ? "selected" : ""}>Débloqué</option>
          </select>
        </div>
        <div class="mobile-field mobile-wide">
          <label>Motif du déblocage</label>
          <input data-field="override_reason" data-product="${product.id}" data-day="${d.index}" value="${escapeHtml(entry.override_reason || "")}" placeholder="Motif">
        </div>` : "";

      cards.push(`<article class="mobile-saisie-card">
        <div class="mobile-card-head">
          <div><strong>${escapeHtml(product.name)}</strong><br><span class="small">${d.name} ${date}</span></div>
          <span data-live-mobile-badge="${key}">${c.hasInput ? (c.conforme ? `<span class="badge ${c.adminOverride && !c.conformeBase ? "badge-warn" : "badge-ok"}">${c.adminOverride && !c.conformeBase ? "Débloqué" : "OK"}</span>` : `<span class="badge badge-bad">Non conforme</span>`) : `<span class="badge badge-neutral">-</span>`}</span>
        </div>
        <div class="mobile-fields">
          <div class="mobile-field"><label>Qté réf.</label><div class="readonly-value">${c.qteRef}</div></div>
          <div class="mobile-field"><label>Qté comptée</label><input ${disabled ? "disabled" : ""} type="number" step="1" min="0" data-field="qte_comptee" data-product="${product.id}" data-day="${d.index}" value="${entry.qte_comptee ?? ""}"></div>
          <div class="mobile-field"><label>Poids total g</label><input ${disabled ? "disabled" : ""} type="number" step="0.01" min="0" data-field="poids_total_g" data-product="${product.id}" data-day="${d.index}" value="${entry.poids_total_g ?? ""}"></div>
          <div class="mobile-field"><label>Pièces NC</label><input ${disabled ? "disabled" : ""} type="number" step="1" min="0" data-field="qte_non_conforme" data-product="${product.id}" data-day="${d.index}" value="${Number(entry.qte_non_conforme || 0) > 0 ? entry.qte_non_conforme : ""}" placeholder="0"></div>
          <div class="mobile-field"><label>Resp. AFP</label><select ${disabled ? "disabled" : ""} data-field="presence_afp" data-product="${product.id}" data-day="${d.index}"><option value="true" ${entry.presence_afp !== false ? "selected" : ""}>Présent</option><option value="false" ${entry.presence_afp === false ? "selected" : ""}>Non présent</option></select></div>
          <div class="mobile-field"><label>Resp. Giffaud</label><select ${disabled ? "disabled" : ""} data-field="presence_giffaud" data-product="${product.id}" data-day="${d.index}"><option value="true" ${entry.presence_giffaud !== false ? "selected" : ""}>Présent</option><option value="false" ${entry.presence_giffaud === false ? "selected" : ""}>Non présent</option></select></div>
          <div class="mobile-field"><label>Rendement réel</label><div class="readonly-value" data-live-real="${key}">${fmtNumber(c.rendementReel)} g</div></div>
          <div class="mobile-field mobile-wide"><label>Résultat jour</label><div class="readonly-value result-readonly" data-live-result="${key}">${dayResultHtml(c)}</div></div>
          <div class="mobile-field mobile-wide"><label>Commentaire</label><input ${disabled ? "disabled" : ""} data-field="commentaire_terrain" data-product="${product.id}" data-day="${d.index}" value="${escapeHtml(entry.commentaire_terrain || "")}" placeholder="Commentaire"></div>
          ${overrideMobile}
        </div>
      </article>`);
    }
  }
  $("#saisie").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Contrôles journaliers</h2><p class="muted">Le calcul se met à jour automatiquement. Le bouton Valider sauvegarde et verrouille uniquement la journée affichée.</p></div>
        <div class="actions action-buttons-compact">
          ${viewActions('saisie', 'saisie_rendement')}
          ${dayLockBadge(selectedDayIndex)}
          <button id="validateDayBtn" class="primary-btn small-btn admin-only" ${!canManageOverride() || !currentWeekly || dayLocked || weekLocked ? "disabled" : ""}>Valider</button>
          <button id="unlockDayBtn" class="secondary-btn small-btn admin-only" ${!canManageOverride() || !currentWeekly || !dayLocked || weekLocked ? "disabled" : ""}>Modifier</button>
        </div>
      </div>
      ${dayFilterHtml("saisieDayFilter", saisieDayFilter)}
      <div class="mobile-saisie-list">${cards.join("")}</div>
      <div class="table-wrap desktop-saisie-table"><table><thead><tr><th>Jour</th><th>Produit</th><th>Qté réf.</th><th>Qté comptée</th><th>Poids total relevé (g)</th><th>Pièces NC</th><th>Resp. AFP</th><th>Resp. Giffaud</th><th>Rendement réf.</th><th>Rendement réel</th><th>Conformité</th><th>Résultat jour</th><th>Commentaire terrain</th>${showOverride ? '<th>Déblocage admin</th><th>Motif</th>' : ''}</tr></thead><tbody>${rows.join("")}</tbody></table></div>
    </div>`;
  $("#saisieDayFilter")?.addEventListener("change", e => { saisieDayFilter = e.target.value === "all" ? currentWeekdayFilter() : e.target.value; renderSaisie(); });
  $("#validateDayBtn")?.addEventListener("click", validateDay);
  $("#unlockDayBtn")?.addEventListener("click", unlockDay);
  attachSaisieLiveListeners();
}

function renderRecapJour() {
  if (recapDayFilter === "all") {
    const all = recapAllDaysSummary();
    $("#recapjour").innerHTML = `
      <div class="card">
        <div class="card-header"><div><h2>Récapitulatif de la semaine</h2><p class="muted">Vue tous les jours — moyenne hebdomadaire par produit</p></div>${viewActions('recapjour', 'recap_jour')}</div>
        ${dayFilterHtml("recapDayFilter", "all")}
        <div class="grid-3" style="margin-top:14px;">
          <div class="kpi"><span>Lignes saisies</span><strong>${all.saisies}</strong></div>
          <div class="kpi"><span>Produits conformes</span><strong>${all.conformes}</strong></div>
          <div class="kpi"><span>Produits à revoir</span><strong>${all.nonConformes}</strong></div>
        </div>
        <div class="table-wrap" style="margin-top:14px;"><table><thead><tr><th>Produit</th><th>Jours saisis</th><th>Réf. hebdo utilisée</th><th>Jours non conformes</th><th>Bonus/Malus final</th><th>Commentaire</th></tr></thead><tbody>
        ${all.rows.map(r => `<tr><td class="product-cell">${escapeHtml(r.product.name)}</td><td>${r.enteredDays}</td><td>${fmtNumber(r.refHebdo)} g</td><td>${r.nonConformes}</td><td>${resultBadgeHtml(r.taux)}</td><td>${escapeHtml(r.commentaire)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>`;
  } else {
    const dIndex = Number(recapDayFilter);
    const ds = dailySummary(dIndex);
    const date = dateForDay($("#weekStart").value, dIndex);
    $("#recapjour").innerHTML = `
      <div class="card">
        <div class="card-header"><div><h2>Récapitulatif du jour</h2><p class="muted">${dayFullLabel(dIndex)}</p></div>${viewActions('recapjour', 'recap_jour')}</div>
        ${dayFilterHtml("recapDayFilter", String(dIndex))}
        <div class="grid-3" style="margin-top:14px;">
          <div class="kpi"><span>Saisies</span><strong>${ds.saisies}</strong></div>
          <div class="kpi"><span>Conformes</span><strong>${ds.conformes}</strong></div>
          <div class="kpi"><span>Non conformes</span><strong>${ds.nonConformes}</strong></div>
        </div>
        ${holidayName(date) ? `<p class="note-box"><strong>Jour férié :</strong> ${holidayName(date)}</p>` : ""}
        <div class="table-wrap" style="margin-top:14px;"><table><thead><tr><th>Produit</th><th>Qté comptée</th><th>Poids relevé</th><th>Rendement réel</th><th>Réf. jour</th><th>Conformité</th><th>Résultat jour</th><th>Commentaire</th></tr></thead><tbody>
        ${ds.rows.map(r => `<tr><td class="product-cell">${escapeHtml(r.product.name)}</td><td>${fmtNumberLoose(r.entry?.qte_comptee, 2)}</td><td>${fmtNumberLoose(r.entry?.poids_total_g, 2)} g</td><td>${fmtNumber(r.calc.rendementReel)} g</td><td>${fmtNumber(r.calc.rendementRef)} g</td><td>${r.calc.hasInput ? (r.calc.conforme ? `<span class="badge ${r.calc.adminOverride && !r.calc.conformeBase ? "badge-warn" : "badge-ok"}">${r.calc.adminOverride && !r.calc.conformeBase ? "Débloqué admin" : "Conforme"}</span>` : `<span class="badge badge-bad">Non conforme</span>`) : `<span class="badge badge-neutral">-</span>`}</td><td>${dayResultHtml(r.calc)}</td><td>${escapeHtml(r.entry?.commentaire_terrain || r.calc.commentaire || "")}</td></tr>`).join("")}
        </tbody></table></div>
      </div>`;
  }
  $("#recapDayFilter")?.addEventListener("change", e => { recapDayFilter = e.target.value; renderRecapJour(); });
}

function productQuantifiedLabel(product) {
  return product.qte_travaille_source || product.synthese_note || "";
}


function updateLiveSyntheseTotals() {
  let total = 0;
  summaryCacheForSynthese.forEach(p => {
    const input = $(`[data-qte-product="${p.product.id}"]`);
    const qte = input ? toNum(input.value) : p.qteTravaille;
    const brut = p.taux !== null && qte !== null ? qte * p.taux : null;
    const qteBonusMalus = (brut !== null ? brut : 0) - Number(p.deductionNonConforme || 0);
    const euros = qteBonusMalus !== null ? qteBonusMalus * Number(p.product.prix_unitaire_eur || 0) : null;
    if (Number.isFinite(Number(euros))) total += Number(euros);
    const brutCell = $(`[data-syn-brut="${p.product.id}"]`);
    const bmCell = $(`[data-syn-qtebm="${p.product.id}"]`);
    const euroCell = $(`[data-syn-euro="${p.product.id}"]`);
    if (brutCell) brutCell.innerHTML = signedQtyHtml(brut ?? 0);
    if (bmCell) bmCell.innerHTML = `<strong>${signedQtyHtml(qteBonusMalus)}</strong>`;
    if (euroCell) euroCell.innerHTML = signedEuroHtml(euros);
  });
  const totalCell = $("#synTotalEuro");
  if (totalCell) totalCell.innerHTML = signedEuroHtml(total);
}

function attachSyntheseLiveListeners() {
  $$("[data-qte-product]").forEach(el => {
    el.addEventListener("input", updateLiveSyntheseTotals);
    el.addEventListener("change", updateLiveSyntheseTotals);
  });
}

let summaryCacheForSynthese = [];
function amountClass(v) {
  const n = Number(v || 0);
  if (n > 0) return "value-positive";
  if (n < 0) return "value-negative";
  return "value-neutral";
}

function signedQtyHtml(v) {
  const n = Number(v || 0);
  if (!n) return `<span class="value-neutral">0,00</span>`;
  const sign = n > 0 ? "+" : "";
  return `<span class="${amountClass(n)}">${sign}${fmtNumber(n, 2)}</span>`;
}

function signedEuroHtml(v) {
  const n = Number(v || 0);
  return `<span class="${amountClass(n)}">${fmtEuro(n)}</span>`;
}

function renderSynthese() {
  const summary = calcSummary();
  summaryCacheForSynthese = summary;
  const disabled = !canEditSaisie() || (currentWeekly && currentWeekly.locked);
  const totalEuro = summary.reduce((s, p) => s + (Number(p.euros) || 0), 0);
  $("#synthese").innerHTML = `
    <div class="print-only"><h1>Rendement hebdomadaire — ${CONFIG.clientName} / ${CONFIG.siteName}</h1><p>Semaine du ${$("#weekStart").value}</p></div>
    <div class="card">
      <div class="card-header">
        <div><h2>Récapitulatif par produit</h2><p class="muted">La synthèse finale est validée séparément des journées de saisie.</p></div>
        <div class="actions">${viewActions('synthese', 'synthese_finale')}<button id="validateWeekBtn" class="primary-btn small-btn admin-only" ${!canManageOverride() || !currentWeekly || (currentWeekly && currentWeekly.locked) ? "disabled" : ""}>Valider semaine</button><button id="unlockWeekBtn" class="secondary-btn small-btn admin-only" ${!canManageOverride() || !currentWeekly || !(currentWeekly && currentWeekly.locked) ? "disabled" : ""}>Modifier semaine</button></div>
      </div>
      <div class="table-wrap synthese-table-wrap"><table class="synthese-table"><thead><tr>
        <th>Produit</th><th>Qté réf.</th><th>Rendement réf.</th>${DAYS.map(d => `<th>${d.name}</th>`).join("")}
        <th>Réf. hebdo utilisée</th><th>Jours non conformes</th><th>Commentaire semaine</th>
        <th>Bonus/Malus rendement</th><th>Produit quantifié</th><th>QTE travaillée</th>
        <th>QTE B/M rendement</th><th>Pièces NC</th><th>Déduction NC x3</th><th>QTE finale</th><th>€</th><th>Commentaire synthèse</th>
      </tr></thead><tbody>
      ${summary.map(p => `<tr>
        <td class="product-cell">${escapeHtml(p.product.name)}</td>
        <td>${p.product.qte_ref}</td><td>${fmtNumber(p.product.rendement_ref_g)} g</td>
        ${p.calcs.map(x => `<td>${fmtNumber(x.calc.rendementReel)} g</td>`).join("")}
        <td>${fmtNumber(p.refHebdo)} g</td><td>${p.nonConformes}</td><td>${escapeHtml(p.commentaire)}</td><td>${resultBadgeHtml(p.taux)}</td>
        <td class="small"><strong>${escapeHtml(productQuantifiedLabel(p.product))}</strong></td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="0.01" min="0" data-qte-product="${p.product.id}" value="${p.qteTravaille ?? ""}"></td>
        <td data-syn-brut="${p.product.id}">${signedQtyHtml(p.qteBonusMalusBrut ?? 0)}</td>
        <td>${fmtNumberLoose(p.qteNonConforme, 0)}</td>
        <td>${p.deductionNonConforme ? `<span class="value-negative">-${fmtNumberLoose(p.deductionNonConforme, 0)}</span>` : `<span class="value-neutral">0</span>`}</td>
        <td data-syn-qtebm="${p.product.id}"><strong>${signedQtyHtml(p.qteBonusMalus)}</strong></td>
        <td><strong data-syn-euro="${p.product.id}">${signedEuroHtml(p.euros)}</strong></td>
        <td><input ${disabled ? "disabled" : ""} data-qte-comment="${p.product.id}" value="${escapeHtml(p.commentaireSynthese)}" placeholder="Note commentaire"></td>
      </tr>`).join("")}
      <tr><td colspan="${14 + DAYS.length}" style="text-align:right"><strong>Total semaine €</strong></td><td><strong id="synTotalEuro">${signedEuroHtml(totalEuro)}</strong></td><td></td></tr>
      </tbody></table></div>
    </div>
    <div class="card"><h2>Note globale de synthèse</h2><textarea id="weekNote" ${disabled ? "disabled" : ""} placeholder="Ajouter une note globale de synthèse">${escapeHtml(currentWeekly?.week_note || "")}</textarea></div>
    <div class="card"><h2>Lecture globale semaine</h2><p>${globalReading(summary)}</p><p class="inline-note">La QTE finale = QTE bonus/malus rendement - déduction pièces non conformes x3.</p></div>`;
  $("#validateWeekBtn")?.addEventListener("click", validateWeek);
  $("#unlockWeekBtn")?.addEventListener("click", unlockWeek);
  attachSyntheseLiveListeners();
}

function globalReading(summary) {
  const m = dashboardMetrics(summary);
  const totalEuro = summary.reduce((s, p) => s + (Number(p.euros) || 0), 0);
  if (m.lignesSaisies === 0) return "Aucune saisie";
  if (m.lignesNonConformes > 0) return `${m.lignesNonConformes} ligne(s) non conforme(s). Le bonus/malus est bloqué sur les produits concernés, sauf déblocage admin.`;
  return `Semaine conforme. Montant total bonus/malus : ${fmtEuro(totalEuro)}.`;
}

function renderProduits() {
  if (!canEditProducts()) { $("#produits").innerHTML = `<div class="card"><p>Accès réservé à l'admin.</p></div>`; return; }
  $("#produits").innerHTML = `
    <div class="card">
      <div class="card-header"><div><h2>Liste produits, seuils et prix</h2><p class="muted">Ces valeurs remplacent la feuille Parametres de l’Excel. Tous les seuils bonus/malus sont modifiables.</p></div><div class="actions">${viewActions('produits', 'liste_produits_seuils')}<button id="addProductBtn" class="secondary-btn">Ajouter un produit</button></div></div>
      <div id="productForms">${allProducts.map(productForm).join("")}</div>
    </div>`;
  $("#addProductBtn").addEventListener("click", addProduct);
  $$(".save-product").forEach(btn => btn.addEventListener("click", () => saveProduct(btn.dataset.product)));
}

function pfInput(field, label, value, type = "number", step = "0.01") { return `<label>${label}<input data-pf="${field}" type="${type}" step="${step}" value="${value ?? ""}"></label>`; }
function productForm(p) {
  return `<div class="product-form" data-product-form="${p.id}">
    <label class="pf-name">Nom produit<input data-pf="name" value="${escapeHtml(p.name)}" placeholder="Produit"></label>
    ${pfInput("sort_order", "Ordre", p.sort_order, "number", "1")}
    <label>Actif<select data-pf="active"><option value="true" ${p.active !== false ? "selected" : ""}>Oui</option><option value="false" ${p.active === false ? "selected" : ""}>Non</option></select></label>
    ${pfInput("qte_ref", "Qté réf.", p.qte_ref, "number", "1")}
    ${pfInput("rendement_ref_g", "Réf. g/pièce", p.rendement_ref_g)}
    ${pfInput("prix_unitaire_eur", "Prix €", p.prix_unitaire_eur)}
    ${pfInput("coefficient_lundi", "Coeff. lundi", p.coefficient_lundi)}
    <label class="pf-wide">Base QTE travaillée<input data-pf="qte_travaille_source" value="${escapeHtml(p.qte_travaille_source || "")}" placeholder="Ex. Épaule A/J"></label>
    <label class="pf-wide">Note visible synthèse<input data-pf="synthese_note" value="${escapeHtml(p.synthese_note || "")}" placeholder="Commentaire produit"></label>
    <div class="section-title">Seuils de rendement</div>
    ${pfInput("tolerance_basse", "Neutre bas", p.tolerance_basse)}
    ${pfInput("tolerance_haute", "Neutre haut", p.tolerance_haute)}
    ${pfInput("seuil_bonus_2", "Seuil bonus 2", p.seuil_bonus_2)}
    ${pfInput("seuil_bonus_3", "Seuil bonus 3", p.seuil_bonus_3)}
    ${pfInput("seuil_malus_1", "Seuil malus 1", p.seuil_malus_1)}
    ${pfInput("seuil_malus_2", "Seuil malus 2", p.seuil_malus_2)}
    ${pfInput("seuil_malus_3", "Seuil malus 3", p.seuil_malus_3)}
    <div class="section-title">Valeurs bonus / malus</div>
    ${pfInput("bonus_1", "Bonus 1", p.bonus_1)}
    ${pfInput("bonus_2", "Bonus 2", p.bonus_2)}
    ${pfInput("bonus_3", "Bonus 3", p.bonus_3)}
    ${pfInput("malus_1", "Malus 1", p.malus_1)}
    ${pfInput("malus_2", "Malus 2", p.malus_2)}
    ${pfInput("malus_3", "Malus 3", p.malus_3)}
    ${pfInput("malus_4", "Malus 4", p.malus_4)}
    <label class="pf-full">Note interne produit<textarea data-pf="product_note" placeholder="Note ou commentaire interne">${escapeHtml(p.product_note || "")}</textarea></label>
    <button class="primary-btn save-product" data-product="${p.id}">Enregistrer produit</button>
  </div>`;
}

async function addProduct() {
  const maxSort = Math.max(0, ...allProducts.map(p => Number(p.sort_order || 0)));
  const payload = {
    name: "Nouveau produit", sort_order: maxSort + 1, active: true, qte_ref: 10, rendement_ref_g: 100, coefficient_lundi: 1.2,
    tolerance_basse: .2, tolerance_haute: .2, seuil_bonus_2: .4, seuil_bonus_3: .6, seuil_malus_1: .4, seuil_malus_2: .6, seuil_malus_3: .8,
    bonus_1: .03, bonus_2: .06, bonus_3: .09, malus_1: -.05, malus_2: -.10, malus_3: -.15, malus_4: -.20,
    prix_unitaire_eur: 0, qte_travaille_source: "", product_note: "", synthese_note: ""
  };
  const { error } = await sb.from("gr_products").insert(payload);
  if (error) return showMessage(error.message, "error");
  await loadSitesProducts(); renderAll(); showMessage("Produit ajouté.");
}

async function saveProduct(id) {
  const form = $(`[data-product-form="${id}"]`);
  const val = (field) => form.querySelector(`[data-pf="${field}"]`).value;
  const payload = {
    name: val("name"), sort_order: toNum(val("sort_order")), active: val("active") === "true",
    qte_ref: toNum(val("qte_ref")), rendement_ref_g: toNum(val("rendement_ref_g")), prix_unitaire_eur: toNum(val("prix_unitaire_eur")), coefficient_lundi: toNum(val("coefficient_lundi")),
    qte_travaille_source: val("qte_travaille_source"), synthese_note: val("synthese_note"), product_note: val("product_note"),
    tolerance_basse: toNum(val("tolerance_basse")), tolerance_haute: toNum(val("tolerance_haute")), seuil_bonus_2: toNum(val("seuil_bonus_2")), seuil_bonus_3: toNum(val("seuil_bonus_3")), seuil_malus_1: toNum(val("seuil_malus_1")), seuil_malus_2: toNum(val("seuil_malus_2")), seuil_malus_3: toNum(val("seuil_malus_3")),
    bonus_1: toNum(val("bonus_1")), bonus_2: toNum(val("bonus_2")), bonus_3: toNum(val("bonus_3")), malus_1: toNum(val("malus_1")), malus_2: toNum(val("malus_2")), malus_3: toNum(val("malus_3")), malus_4: toNum(val("malus_4")), updated_at: new Date().toISOString()
  };
  const { error } = await sb.from("gr_products").update(payload).eq("id", id);
  if (error) return showMessage(error.message, "error");
  await loadSitesProducts(); await loadWeek(); renderAll(); showMessage("Produit mis à jour.");
}

function renderUtilisateurs() {
  if (!canEditUsers()) { $("#utilisateurs").innerHTML = `<div class="card"><p>Accès réservé à l'admin.</p></div>`; return; }
  $("#utilisateurs").innerHTML = `
    <div class="card"><h2>Utilisateurs</h2><p class="muted">Le compte email/mot de passe se crée dans Supabase Authentication. Ici, on attribue le rôle applicatif et les accès modules.</p>
      <div class="form-grid">
        <input id="newProfileId" placeholder="UUID utilisateur Supabase Auth">
        <input id="newProfileEmail" placeholder="Email">
        <input id="newProfileName" placeholder="Nom complet">
        <select id="newProfileRole"><option value="responsable_afp">Responsable AFP</option><option value="responsable_giffaud">Responsable Giffaud</option><option value="lecture">Lecture seule</option><option value="admin">Admin</option></select>
      </div>
      <label class="active-profile-toggle"><input type="checkbox" id="newProfileActive" checked> Profil actif</label>
      <div class="role-perm-grid">
        <label><input type="checkbox" id="perm_dashboard" checked> Tableau de bord</label>
        <label><input type="checkbox" id="perm_saisie"> Saisie rendement</label>
        <label><input type="checkbox" id="perm_recap" checked> Récap jour</label>
        <label><input type="checkbox" id="perm_synthese" checked> Synthèse finale</label>
        <label><input type="checkbox" id="perm_products"> Liste produits</label>
        <label><input type="checkbox" id="perm_users"> Gestion utilisateurs</label>
        <label><input type="checkbox" id="perm_override"> Déblocage admin</label>
      </div>
      <div class="user-form-actions">
        <button id="saveProfileBtn" class="primary-btn">Créer / mettre à jour profil</button>
        <button id="resetProfileBtn" class="secondary-btn">Nouveau profil</button>
      </div>
      <div id="profilesTable" class="table-wrap users-table-wrap" style="margin-top:16px;"></div>
    </div>`;
  $("#saveProfileBtn").addEventListener("click", saveProfile);
  $("#resetProfileBtn").addEventListener("click", resetProfileForm);
  $("#newProfileRole").addEventListener("change", applyRolePermissionsUI);
  applyRolePermissionsUI();
  loadProfilesTable();
}

function collectPermissionInputs(){ return { view_dashboard: $("#perm_dashboard").checked, view_saisie: $("#perm_saisie").checked, view_recap: $("#perm_recap").checked, view_synthese: $("#perm_synthese").checked, manage_products: $("#perm_products").checked, manage_users: $("#perm_users").checked, manage_override: $("#perm_override").checked }; }

function setPermissionInputs(permissions, role) {
  const p = Object.assign(defaultPermissionsByRole(role || $("#newProfileRole")?.value || "lecture"), permissions || {});
  if(!$("#perm_dashboard")) return;
  $("#perm_dashboard").checked=p.view_dashboard;
  $("#perm_saisie").checked=p.view_saisie;
  $("#perm_recap").checked=p.view_recap;
  $("#perm_synthese").checked=p.view_synthese;
  $("#perm_products").checked=p.manage_products;
  $("#perm_users").checked=p.manage_users;
  $("#perm_override").checked=p.manage_override;
}

function applyRolePermissionsUI(){ setPermissionInputs(null, $("#newProfileRole")?.value || 'lecture'); }

function resetProfileForm() {
  $("#newProfileId").value = "";
  $("#newProfileId").disabled = false;
  $("#newProfileEmail").value = "";
  $("#newProfileName").value = "";
  $("#newProfileRole").value = "responsable_afp";
  $("#newProfileActive").checked = true;
  applyRolePermissionsUI();
  $("#saveProfileBtn").textContent = "Créer / mettre à jour profil";
}

function editProfileFromTable(id) {
  const p = profilesCache.find(x => x.id === id);
  if (!p) return showMessage("Profil introuvable.", "error");
  $("#newProfileId").value = p.id;
  $("#newProfileId").disabled = true;
  $("#newProfileEmail").value = p.email || "";
  $("#newProfileName").value = p.full_name || "";
  $("#newProfileRole").value = p.role || "lecture";
  $("#newProfileActive").checked = p.active !== false;
  setPermissionInputs(p.permissions, p.role);
  $("#saveProfileBtn").textContent = "Enregistrer les modifications";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function setProfileActive(id, active) {
  if (id === session.user.id && !active) return showMessage("Tu ne peux pas désactiver ton propre profil connecté.", "error");
  const { error } = await sb.from("gr_profiles").update({ active }).eq("id", id);
  if (error) return showMessage(error.message, "error");
  await loadProfilesTable();
  showMessage(active ? "Profil réactivé." : "Profil désactivé.");
}

async function deleteProfile(id) {
  if (id === session.user.id) return showMessage("Tu ne peux pas supprimer ton propre profil connecté.", "error");
  const p = profilesCache.find(x => x.id === id);
  const label = p?.email || "cet utilisateur";
  if (!confirm(`Supprimer l'accès applicatif de ${label} ?\n\nLe compte Supabase Auth restera existant, mais il ne pourra plus accéder à l'application tant qu'un profil n'est pas recréé.`)) return;
  const { error } = await sb.from("gr_profiles").delete().eq("id", id);
  if (error) return showMessage(error.message, "error");
  resetProfileForm();
  await loadProfilesTable();
  showMessage("Profil supprimé de l'application.");
}

async function loadProfilesTable() {
  const { data, error } = await sb.from("gr_profiles").select("*").order("created_at");
  if (error) { $("#profilesTable").innerHTML = error.message; return; }
  profilesCache = data || [];
  $("#profilesTable").innerHTML = `<table class="users-table"><thead><tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Actif</th><th>Accès modules</th><th>Actions</th></tr></thead><tbody>${profilesCache.map(p => { const pr = Object.assign(defaultPermissionsByRole(p.role), p.permissions || {}); const list = [pr.view_dashboard?'Dashboard':'', pr.view_saisie?'Saisie':'', pr.view_recap?'Récap':'', pr.view_synthese?'Synthèse':'', pr.manage_products?'Produits':'', pr.manage_users?'Utilisateurs':'', pr.manage_override?'Déblocage':''].filter(Boolean).join(', '); return `<tr class="${p.active ? "" : "user-disabled"}"><td>${escapeHtml(p.email)}</td><td>${escapeHtml(p.full_name || "")}</td><td>${roleLabel(p.role)}</td><td>${p.active ? "Oui" : "Non"}</td><td>${escapeHtml(list)}</td><td><div class="user-row-actions"><button class="secondary-btn mini-user-btn" data-action="edit" data-id="${p.id}">Modifier droits</button><button class="secondary-btn mini-user-btn" data-action="${p.active ? "disable" : "enable"}" data-id="${p.id}">${p.active ? "Désactiver" : "Réactiver"}</button><button class="danger-btn mini-user-btn" data-action="delete" data-id="${p.id}">Supprimer</button></div></td></tr>`; }).join("")}</tbody></table>`;
  $$("#profilesTable [data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "edit") editProfileFromTable(id);
      if (action === "disable") setProfileActive(id, false);
      if (action === "enable") setProfileActive(id, true);
      if (action === "delete") deleteProfile(id);
    });
  });
}

async function saveProfile() {
  const id = $("#newProfileId").value.trim();
  if (!id) return showMessage("Il faut l'UUID du compte créé dans Supabase Authentication.", "error");
  const payload = {
    id,
    email: $("#newProfileEmail").value.trim(),
    full_name: $("#newProfileName").value.trim(),
    role: $("#newProfileRole").value,
    active: $("#newProfileActive").checked,
    permissions: collectPermissionInputs()
  };
  const { error } = await sb.from("gr_profiles").upsert(payload, { onConflict: "id" });
  if (error) return showMessage(error.message, "error");
  showMessage("Profil enregistré.");
  resetProfileForm();
  loadProfilesTable();
}

async function ensureWeekly() {
  if (currentWeekly) return true;
  await loadWeek();
  if (!currentWeekly) { showMessage("Impossible de créer la semaine. Vérifie ton rôle utilisateur.", "error"); return false; }
  return true;
}

async function clearDisplayedDay() {
  if (!(await ensureWeekly())) return;
  const dayIndex = Number(saisieDayFilter);
  if (!dayIndex || !DAYS.some(d => d.index === dayIndex)) return showMessage("Choisis une journée précise à effacer.", "error");
  if (!confirm(`Effacer toutes les saisies du ${DAYS.find(d => d.index === dayIndex)?.name} de cette semaine ?`)) return;

  const payloads = products.map(product => ({
    weekly_id: currentWeekly.id,
    product_id: product.id,
    day_index: dayIndex,
    work_date: dateForDay($("#weekStart").value, dayIndex),
    qte_ref_snapshot: product.qte_ref,
    qte_comptee: null,
    poids_total_g: null,
    qte_non_conforme: null,
    presence_afp: true,
    presence_giffaud: true,
    commentaire_terrain: "",
    admin_override: false,
    override_reason: "",
    updated_by: session.user.id
  }));

  const { error } = await sb.from("gr_control_entries").upsert(payloads, { onConflict: "weekly_id,product_id,day_index" });
  if (error) return showMessage(error.message, "error");
  await loadWeek();
  renderAll();
  showMessage("Journée remise à zéro.");
}

async function saveEntries(options = {}) {
  const silent = !!options.silent;
  lastSaveError = "";
  if (!(await ensureWeekly())) return;
  const payloads = [];
  for (const input of $$('[data-field]')) {
    if (input.offsetParent === null) continue;
    const productId = input.dataset.product;
    const dayIndex = Number(input.dataset.day);
    let row = payloads.find(x => x.product_id === productId && x.day_index === dayIndex);
    if (!row) {
      const product = products.find(p => p.id === productId);
      row = {
        weekly_id: currentWeekly.id,
        product_id: productId,
        day_index: dayIndex,
        work_date: dateForDay($("#weekStart").value, dayIndex),
        qte_ref_snapshot: product.qte_ref,
        qte_comptee: null,
        poids_total_g: null,
        qte_non_conforme: null,
        presence_afp: true,
        presence_giffaud: true,
        commentaire_terrain: "",
        admin_override: false,
        override_reason: "",
        updated_by: session.user.id
      };
      payloads.push(row);
    }
    const field = input.dataset.field;
    if (["presence_afp", "presence_giffaud", "admin_override"].includes(field)) row[field] = input.value === "true";
    else if (["commentaire_terrain", "override_reason"].includes(field)) row[field] = input.value.trim();
    else if (field === "qte_non_conforme") {
      const v = toNum(input.value);
      row[field] = v !== null && Number(v) > 0 ? v : null;
    }
    else row[field] = toNum(input.value);
  }
  if (!payloads.length) { lastSaveError = "Aucune ligne à enregistrer."; if (!silent) showMessage(lastSaveError, "error"); return false; }
  // On enregistre toutes les lignes visibles, même remises à zéro.
  // Cela permet de corriger une seule ligne déjà sauvegardée sans effacer toute la journée.
  const { error } = await sb.from("gr_control_entries").upsert(payloads, { onConflict: "weekly_id,product_id,day_index" });
  if (error) { lastSaveError = error.message; if (!silent) showMessage(error.message, "error"); return false; }
  if (!silent) { await loadWeek(); renderAll(); showMessage("Saisie enregistrée."); }
  return true;
}
async function saveQuantities(options = {}) {
  const silent = !!options.silent;
  if (!(await ensureWeekly())) return;
  const payloads = [];
  for (const input of $$('[data-qte-product]')) {
    const productId = input.dataset.qteProduct;
    const comment = $(`[data-qte-comment="${productId}"]`)?.value?.trim() || "";
    const qte = toNum(input.value);
    if (qte !== null || comment) payloads.push({ weekly_id: currentWeekly.id, product_id: productId, qte_travaille: qte, commentaire_synthese: comment, updated_by: session.user.id });
  }
  if (payloads.length) {
    const { error } = await sb.from("gr_weekly_product_quantities").upsert(payloads, { onConflict: "weekly_id,product_id" });
    if (error) { if (!silent) showMessage(error.message, "error"); return false; }
  }
  const weekNote = $("#weekNote")?.value?.trim() || "";
  const up = await sb.from("gr_weekly_headers").update({ week_note: weekNote, updated_at: new Date().toISOString() }).eq("id", currentWeekly.id);
  if (up.error) { if (!silent) showMessage(up.error.message, "error"); return false; }
  if (!silent) { await loadWeek(); renderAll(); showMessage("Synthèse enregistrée."); }
  return true;
}
async function validateDay() {
  if (!currentWeekly || !canManageOverride()) return;
  const dayIndex = Number(saisieDayFilter);
  if (!dayIndex || !DAYS.some(d => d.index === dayIndex)) return showMessage("Choisis une journée précise à valider.", "error");

  const ok = await saveEntries({ silent: true });
  if (!ok) return showMessage(lastSaveError || "Aucune saisie à valider ou erreur lors de la sauvegarde.", "error");

  const nextLockedDays = { ...lockedDaysObj(), [String(dayIndex)]: true };
  const { error } = await sb.from("gr_weekly_headers").update({
    locked_days: nextLockedDays,
    updated_at: new Date().toISOString()
  }).eq("id", currentWeekly.id);

  if (error) return showMessage(error.message, "error");
  await loadWeek();
  renderAll();
  showMessage("Journée sauvegardée et validée.");
}

async function unlockDay() {
  if (!currentWeekly || !canManageOverride()) return;
  const dayIndex = Number(saisieDayFilter);
  const nextLockedDays = { ...lockedDaysObj(), [String(dayIndex)]: false };
  const { error } = await sb.from("gr_weekly_headers").update({
    locked_days: nextLockedDays,
    updated_at: new Date().toISOString()
  }).eq("id", currentWeekly.id);

  if (error) return showMessage(error.message, "error");
  await loadWeek();
  renderAll();
  showMessage("Journée modifiable.");
}

async function validateWeek() {
  if (!currentWeekly || !canManageOverride()) return;

  const ok = await saveQuantities({ silent: true });
  if (!ok) return showMessage("Erreur lors de la sauvegarde de la synthèse.", "error");

  const { error } = await sb.from("gr_weekly_headers").update({
    locked: true,
    status: "validée",
    validated_by: session.user.id,
    validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }).eq("id", currentWeekly.id);
  if (error) return showMessage(error.message, "error");
  await loadWeek();
  renderAll();
  showMessage("Synthèse semaine sauvegardée et validée.");
}

async function unlockWeek() {
  if (!currentWeekly || !canManageOverride()) return;
  const { error } = await sb.from("gr_weekly_headers").update({
    locked: false,
    status: "brouillon",
    validated_by: null,
    validated_at: null,
    updated_at: new Date().toISOString()
  }).eq("id", currentWeekly.id);
  if (error) return showMessage(error.message, "error");
  await loadWeek();
  renderAll();
  showMessage("Synthèse semaine modifiable.");
}

async function boot() {
  if (!initSupabase()) return;
  $("#loginBtn").addEventListener("click", login);
  $("#loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("#logoutBtn").addEventListener("click", logout);
  $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#weekStart").addEventListener("change", async () => { syncWeekNumberSelector(); await loadWeek(); renderAll(); });
  const { data } = await sb.auth.getSession();
  if (data.session) { session = data.session; await afterLogin(); }
}

document.addEventListener("DOMContentLoaded", boot);
