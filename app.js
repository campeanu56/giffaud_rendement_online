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
let activeView = "dashboard";
let saisieDayFilter = "all";
let recapDayFilter = String(new Date().getDay() || 7);
if (!DAYS.some(d => String(d.index) === recapDayFilter)) recapDayFilter = "1";

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
function canEditSaisie() { return profile && ["admin", "responsable_afp", "responsable_giffaud"].includes(profile.role) && profile.active; }
function canEditProducts() { return profile && profile.role === "admin" && profile.active; }
function canEditUsers() { return profile && profile.role === "admin" && profile.active; }

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
    $("#logoutBtn").classList.remove("hidden");
    $("#userInfo").classList.remove("hidden");
    $("#userInfo").innerHTML = `<strong>${escapeHtml(profile.full_name || profile.email)}</strong><br>${roleLabel(profile.role)}`;
    $$(".admin-only").forEach(el => el.style.display = canEditProducts() ? "" : "none");
    await loadInitialData();
  } catch (err) {
    $("#loginError").textContent = err.message;
    $("#loginError").classList.remove("hidden");
    await sb.auth.signOut();
  }
}

async function loadInitialData() {
  $("#weekStart").value = isoDate(mondayOf(new Date()));
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
  const presenceAfp = entry ? !!entry.presence_afp : false;
  const presenceGiffaud = entry ? !!entry.presence_giffaud : false;
  const hasInput = qteComptee !== null || poids !== null || presenceAfp || presenceGiffaud;
  let conforme = null, commentaire = "", note = null, resultat = "";

  if (hasInput) {
    conforme = qteComptee === qteRef && presenceAfp && presenceGiffaud;
    if (conforme) commentaire = "Rendement exploitable";
    else {
      const reasons = [];
      if (qteComptee !== qteRef) reasons.push("quantité de pièces non respectée");
      if (!presenceAfp) reasons.push("absence responsable AFP");
      if (!presenceGiffaud) reasons.push("absence responsable Giffaud");
      commentaire = "Rendement non conforme : " + reasons.join(" ; ");
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
    else if (note > 0) resultat = "Bonus";
    else if (note < 0) resultat = "Malus";
    else resultat = "Neutre";
  }
  return { qteRef, rendementRef, rendementReel, ecart, conforme, commentaire, note, resultat, hasInput };
}

function calcSummary() {
  return products.map(product => {
    const calcs = DAYS.map(d => ({ day: d, entry: getEntry(product.id, d.index), calc: calcEntry(product, getEntry(product.id, d.index), d.index) }));
    const entered = calcs.filter(x => x.calc.rendementReel !== null);
    const moyenne = entered.length ? entered.reduce((s, x) => s + x.calc.rendementReel, 0) / entered.length : null;
    const nonConformes = calcs.filter(x => x.calc.hasInput && x.calc.conforme === false).length;
    const conformes = calcs.filter(x => x.calc.conforme === true);
    const refHebdo = conformes.length ? conformes.reduce((s, x) => s + x.calc.rendementRef, 0) / conformes.length : null;
    const semaineConforme = entered.length > 0 && nonConformes === 0;
    let taux = null;
    if (semaineConforme && moyenne !== null && refHebdo !== null) {
      if (moyenne < refHebdo * (1 - Number(product.seuil_bonus_3))) taux = Number(product.bonus_3);
      else if (moyenne < refHebdo * (1 - Number(product.seuil_bonus_2))) taux = Number(product.bonus_2);
      else if (moyenne < refHebdo * (1 - Number(product.tolerance_basse))) taux = Number(product.bonus_1);
      else if (moyenne <= refHebdo * (1 + Number(product.tolerance_haute))) taux = 0;
      else if (moyenne <= refHebdo * (1 + Number(product.seuil_malus_1))) taux = Number(product.malus_1);
      else if (moyenne <= refHebdo * (1 + Number(product.seuil_malus_2))) taux = Number(product.malus_2);
      else if (moyenne <= refHebdo * (1 + Number(product.seuil_malus_3))) taux = Number(product.malus_3);
      else taux = Number(product.malus_4);
    }
    const qte = getQuantity(product.id);
    const qteTravaille = qte ? toNum(qte.qte_travaille) : null;
    const qteBonusMalus = taux !== null && qteTravaille !== null ? qteTravaille * taux : null;
    const euros = qteBonusMalus !== null ? qteBonusMalus * Number(product.prix_unitaire_eur || 0) : null;
    const commentaire = !entered.length ? "Aucune saisie" : (semaineConforme ? "Semaine conforme" : `Semaine non conforme - bonus/malus non applicable (${nonConformes} jour(s))`);
    return { product, calcs, entered, moyenne, nonConformes, semaineConforme, refHebdo, taux, qteTravaille, qteBonusMalus, euros, commentaire, commentaireSynthese: qte?.commentaire_synthese || "" };
  });
}

function dashboardMetrics(summary) {
  const lignesSaisies = summary.reduce((s, p) => s + p.entered.length, 0);
  const lignesNonConformes = summary.reduce((s, p) => s + p.nonConformes, 0);
  const totalEuro = summary.reduce((s, p) => s + (Number(p.euros) || 0), 0);
  const nbBonus = summary.filter(p => p.taux > 0).length;
  const nbMalus = summary.filter(p => p.taux < 0).length;
  const nbNeutre = summary.filter(p => p.taux === 0).length;
  return { lignesSaisies, lignesNonConformes, totalEuro, nbBonus, nbMalus, nbNeutre };
}

function dailySummary(dayIndex) {
  const rows = products.map(product => {
    const entry = getEntry(product.id, dayIndex);
    return { product, entry, calc: calcEntry(product, entry, dayIndex) };
  });
  const saisies = rows.filter(r => r.calc.hasInput).length;
  const conformes = rows.filter(r => r.calc.conforme === true).length;
  const nonConformes = rows.filter(r => r.calc.conforme === false).length;
  const bonus = rows.filter(r => r.calc.conforme === true && r.calc.note > 0).length;
  const malus = rows.filter(r => r.calc.conforme === true && r.calc.note < 0).length;
  return { rows, saisies, conformes, nonConformes, bonus, malus };
}

function renderAll() {
  renderDashboard(); renderSaisie(); renderRecapJour(); renderSynthese(); renderCalendrier(); renderProduits(); renderUtilisateurs();
  showView(activeView);
}

function setTitles(title) {
  $("#pageTitle").textContent = title;
  const week = $("#weekStart").value;
  $("#pageSubtitle").textContent = `${CONFIG.clientName} - ${CONFIG.siteName} / ${CONFIG.prestataireName} — semaine du ${week}`;
}
function showView(view) {
  activeView = view;
  $$(".view").forEach(v => v.classList.remove("active-view"));
  const node = $(`#${view}`);
  if (node) node.classList.add("active-view");
  $$(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  setTitles(({ dashboard: "Tableau de bord", saisie: "Saisie rendement", recapjour: "Récapitulatif journalier", synthese: "Synthèse finale", calendrier: "Calendrier 2026", produits: "Liste produits", utilisateurs: "Utilisateurs" })[view] || "Application");
}

function badgeStatus(text, isOk, enteredCount) {
  if (!enteredCount) return `<span class="badge badge-neutral">Aucune saisie</span>`;
  return `<span class="badge ${isOk ? "badge-ok" : "badge-bad"}">${isOk ? "Conforme" : "Non conforme"}</span>`;
}

function renderDashboard() {
  const summary = calcSummary();
  const m = dashboardMetrics(summary);
  const weekStart = $("#weekStart").value;
  const weekDays = DAYS.map(d => ({...d, date: dateForDay(weekStart, d.index), holiday: holidayName(dateForDay(weekStart, d.index)), summary: dailySummary(d.index)}));
  $("#dashboard").innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><span>Lignes saisies</span><strong>${m.lignesSaisies}</strong></div>
      <div class="kpi"><span>Non conformes</span><strong>${m.lignesNonConformes}</strong></div>
      <div class="kpi"><span>Produits bonus</span><strong>${m.nbBonus}</strong></div>
      <div class="kpi"><span>Produits malus</span><strong>${m.nbMalus}</strong></div>
      <div class="kpi"><span>Total €</span><strong>${fmtEuro(m.totalEuro)}</strong></div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Semaine en cours</h2><span class="badge ${m.lignesSaisies === 0 ? "badge-neutral" : m.lignesNonConformes ? "badge-bad" : "badge-ok"}">${m.lignesSaisies === 0 ? "Aucune saisie" : m.lignesNonConformes ? "Contrôle à revoir" : "Semaine conforme"}</span></div>
      <p class="muted">Le tableau de bord ouvre automatiquement sur la semaine courante. Le total des quantités mélangées n’est pas affiché : les quantités restent suivies produit par produit.</p>
      ${currentWeekly?.week_note ? `<div class="note-box"><strong>Note de synthèse :</strong> ${escapeHtml(currentWeekly.week_note)}</div>` : ""}
    </div>
    <div class="card">
      <div class="card-header"><h2>Récapitulatif par jour</h2><button class="secondary-btn" onclick="showView('recapjour')">Voir détail jour</button></div>
      <div class="table-wrap"><table><thead><tr><th>Jour</th><th>Date</th><th>Férié</th><th>Saisies</th><th>Conformes</th><th>Non conformes</th><th>Bonus jour</th><th>Malus jour</th></tr></thead><tbody>
        ${weekDays.map(d => `<tr><td><strong>${d.name}</strong></td><td>${d.date}</td><td>${d.holiday ? `<span class="badge badge-holiday">${d.holiday}</span>` : "-"}</td><td>${d.summary.saisies}</td><td>${d.summary.conformes}</td><td>${d.summary.nonConformes}</td><td>${d.summary.bonus}</td><td>${d.summary.malus}</td></tr>`).join("")}
      </tbody></table></div>
    </div>
    <div class="card">
      <div class="card-header"><h2>Résumé par produit</h2><button class="secondary-btn" onclick="showView('synthese')">Ouvrir synthèse</button></div>
      <div class="table-wrap"><table><thead><tr><th>Produit</th><th>Moyenne hebdo</th><th>Réf. utilisée</th><th>Statut</th><th>Taux final</th><th>Montant</th><th>Note produit</th></tr></thead><tbody>
        ${summary.map(p => `<tr><td class="product-cell">${escapeHtml(p.product.name)}</td><td>${fmtNumber(p.moyenne)} g/pièce</td><td>${fmtNumber(p.refHebdo)} g/pièce</td><td>${badgeStatus(p.commentaire, p.semaineConforme, p.entered.length)}</td><td>${fmtPercent(p.taux)}</td><td>${fmtEuro(p.euros)}</td><td class="small">${escapeHtml(p.product.synthese_note || p.product.qte_travaille_source || "")}</td></tr>`).join("")}
      </tbody></table></div>
    </div>`;
}

function dayFilterHtml(id, current) {
  return `<div class="day-filter"><label>Jour affiché<select id="${id}"><option value="all" ${current === "all" ? "selected" : ""}>Tous les jours</option>${DAYS.map(d => `<option value="${d.index}" ${current === String(d.index) ? "selected" : ""}>${dayFullLabel(d.index)}</option>`).join("")}</select></label></div>`;
}

function renderSaisie() {
  const disabled = !canEditSaisie() || (currentWeekly && currentWeekly.locked);
  const visibleDays = saisieDayFilter === "all" ? DAYS : DAYS.filter(d => String(d.index) === saisieDayFilter);
  const rows = [];
  for (const d of visibleDays) {
    for (const product of products) {
      const entry = getEntry(product.id, d.index) || {};
      const c = calcEntry(product, entry, d.index);
      const date = dateForDay($("#weekStart").value, d.index);
      rows.push(`<tr class="${product.sort_order === 1 ? "day-separator" : ""}">
        <td><strong>${d.name}</strong><br><span class="small">${date}</span>${holidayName(date) ? `<br><span class="badge badge-holiday">${holidayName(date)}</span>` : ""}</td>
        <td class="product-cell">${escapeHtml(product.name)}<br><span class="small">${escapeHtml(product.qte_travaille_source || "")}</span></td>
        <td>${c.qteRef}</td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="1" min="0" data-field="qte_comptee" data-product="${product.id}" data-day="${d.index}" value="${entry.qte_comptee ?? ""}"></td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="0.01" min="0" data-field="poids_total_g" data-product="${product.id}" data-day="${d.index}" value="${entry.poids_total_g ?? ""}"></td>
        <td><select ${disabled ? "disabled" : ""} data-field="presence_afp" data-product="${product.id}" data-day="${d.index}"><option value="false">Non</option><option value="true" ${entry.presence_afp ? "selected" : ""}>Oui</option></select></td>
        <td><select ${disabled ? "disabled" : ""} data-field="presence_giffaud" data-product="${product.id}" data-day="${d.index}"><option value="false">Non</option><option value="true" ${entry.presence_giffaud ? "selected" : ""}>Oui</option></select></td>
        <td>${fmtNumber(c.rendementRef)} g</td>
        <td>${fmtNumber(c.rendementReel)} g</td>
        <td>${c.hasInput ? (c.conforme ? `<span class="badge badge-ok">Conforme</span>` : `<span class="badge badge-bad">Non conforme</span>`) : `<span class="badge badge-neutral">-</span>`}<br><span class="small">${escapeHtml(c.commentaire)}</span></td>
        <td>${fmtPercent(c.note)}</td>
        <td>${c.resultat || "-"}</td>
        <td><input ${disabled ? "disabled" : ""} data-field="commentaire_terrain" data-product="${product.id}" data-day="${d.index}" value="${escapeHtml(entry.commentaire_terrain || "")}" placeholder="Commentaire"></td>
      </tr>`);
    }
  }
  $("#saisie").innerHTML = `
    <div class="card">
      <div class="card-header">
        <div><h2>Contrôles journaliers</h2><p class="muted">La date journalière est préparée automatiquement à partir de la semaine sélectionnée.</p></div>
        <div class="actions"><button id="saveEntriesBtn" class="primary-btn" ${disabled ? "disabled" : ""}>Enregistrer</button><button id="lockWeekBtn" class="secondary-btn admin-only" ${!canEditProducts() || !currentWeekly ? "disabled" : ""}>${currentWeekly && currentWeekly.locked ? "Déverrouiller" : "Valider / verrouiller"}</button></div>
      </div>
      ${dayFilterHtml("saisieDayFilter", saisieDayFilter)}
      <div class="table-wrap"><table><thead><tr><th>Jour</th><th>Produit</th><th>Qté réf.</th><th>Qté comptée</th><th>Poids total relevé (g)</th><th>Resp. AFP</th><th>Resp. Giffaud</th><th>Rendement réf.</th><th>Rendement réel</th><th>Conformité</th><th>Note jour</th><th>Résultat</th><th>Commentaire terrain</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
    </div>`;
  $("#saisieDayFilter")?.addEventListener("change", e => { saisieDayFilter = e.target.value; renderSaisie(); });
  $("#saveEntriesBtn")?.addEventListener("click", saveEntries);
  $("#lockWeekBtn")?.addEventListener("click", toggleLockWeek);
}

function renderRecapJour() {
  const dIndex = recapDayFilter === "all" ? 1 : Number(recapDayFilter);
  const ds = dailySummary(dIndex);
  const date = dateForDay($("#weekStart").value, dIndex);
  $("#recapjour").innerHTML = `
    <div class="card">
      <div class="card-header"><div><h2>Récapitulatif du jour</h2><p class="muted">${dayFullLabel(dIndex)}</p></div><div class="actions"><button class="secondary-btn" onclick="showView('saisie')">Modifier les saisies</button></div></div>
      ${dayFilterHtml("recapDayFilter", String(dIndex))}
      <div class="grid-3" style="margin-top:14px;">
        <div class="kpi"><span>Saisies</span><strong>${ds.saisies}</strong></div>
        <div class="kpi"><span>Conformes</span><strong>${ds.conformes}</strong></div>
        <div class="kpi"><span>Non conformes</span><strong>${ds.nonConformes}</strong></div>
      </div>
      ${holidayName(date) ? `<p class="note-box"><strong>Jour férié :</strong> ${holidayName(date)}</p>` : ""}
      <div class="table-wrap" style="margin-top:14px;"><table><thead><tr><th>Produit</th><th>Qté comptée</th><th>Poids relevé</th><th>Rendement réel</th><th>Réf. jour</th><th>Écart</th><th>Conformité</th><th>Note</th><th>Résultat</th><th>Commentaire</th></tr></thead><tbody>
      ${ds.rows.map(r => `<tr><td class="product-cell">${escapeHtml(r.product.name)}</td><td>${fmtNumberLoose(r.entry?.qte_comptee, 2)}</td><td>${fmtNumberLoose(r.entry?.poids_total_g, 2)} g</td><td>${fmtNumber(r.calc.rendementReel)} g</td><td>${fmtNumber(r.calc.rendementRef)} g</td><td>${fmtPercent(r.calc.ecart)}</td><td>${r.calc.hasInput ? (r.calc.conforme ? `<span class="badge badge-ok">Conforme</span>` : `<span class="badge badge-bad">Non conforme</span>`) : `<span class="badge badge-neutral">-</span>`}</td><td>${fmtPercent(r.calc.note)}</td><td>${r.calc.resultat || "-"}</td><td>${escapeHtml(r.entry?.commentaire_terrain || r.calc.commentaire || "")}</td></tr>`).join("")}
      </tbody></table></div>
    </div>`;
  $("#recapDayFilter")?.addEventListener("change", e => { recapDayFilter = e.target.value === "all" ? "1" : e.target.value; renderRecapJour(); });
}

function renderSynthese() {
  const summary = calcSummary();
  const disabled = !canEditSaisie() || (currentWeekly && currentWeekly.locked);
  const totalEuro = dashboardMetrics(summary).totalEuro;
  $("#synthese").innerHTML = `
    <div class="print-only"><h1>Rendement hebdomadaire — ${CONFIG.clientName} / ${CONFIG.siteName}</h1><p>Semaine du ${$("#weekStart").value}</p></div>
    <div class="card">
      <div class="card-header"><div><h2>Récapitulatif par produit</h2><p class="muted">La synthèse reprend la logique Excel : si un produit a une journée non conforme, le bonus/malus final du produit est bloqué.</p></div><div class="actions"><button class="secondary-btn" onclick="window.print()">Imprimer / PDF</button><button id="saveQtyBtn" class="primary-btn" ${disabled ? "disabled" : ""}>Enregistrer synthèse</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>Produit</th><th>Base / note produit</th><th>Qté réf.</th><th>Rendement réf.</th>${DAYS.map(d => `<th>${d.name}</th>`).join("")}<th>Moyenne hebdo</th><th>Jours non conformes</th><th>Commentaire semaine</th><th>Bonus/Malus final</th><th>QTE travaillée</th><th>QTE bonus/malus</th><th>€</th><th>Réf. hebdo utilisée</th><th>Commentaire synthèse</th></tr></thead><tbody>
      ${summary.map(p => `<tr>
        <td class="product-cell">${escapeHtml(p.product.name)}</td>
        <td class="small">${escapeHtml(p.product.qte_travaille_source || p.product.synthese_note || "")}</td>
        <td>${p.product.qte_ref}</td><td>${fmtNumber(p.product.rendement_ref_g)} g</td>
        ${p.calcs.map(x => `<td>${fmtNumber(x.calc.rendementReel)} g</td>`).join("")}
        <td>${fmtNumber(p.moyenne)} g</td><td>${p.nonConformes}</td><td>${escapeHtml(p.commentaire)}</td><td>${fmtPercent(p.taux)}</td>
        <td><input ${disabled ? "disabled" : ""} type="number" step="0.01" min="0" data-qte-product="${p.product.id}" value="${p.qteTravaille ?? ""}"></td>
        <td>${fmtNumber(p.qteBonusMalus, 2)}</td><td><strong>${fmtEuro(p.euros)}</strong></td><td>${fmtNumber(p.refHebdo)} g</td>
        <td><input ${disabled ? "disabled" : ""} data-qte-comment="${p.product.id}" value="${escapeHtml(p.commentaireSynthese)}" placeholder="Note commentaire"></td>
      </tr>`).join("")}
      <tr><td colspan="${10 + DAYS.length}" style="text-align:right"><strong>Total semaine €</strong><br><span class="small">Prise en compte uniquement des produits conformes</span></td><td><strong>${fmtEuro(totalEuro)}</strong></td><td colspan="2"></td></tr>
      </tbody></table></div>
    </div>
    <div class="card"><h2>Note globale de synthèse</h2><textarea id="weekNote" ${disabled ? "disabled" : ""} placeholder="Ajouter une note globale de synthèse">${escapeHtml(currentWeekly?.week_note || "")}</textarea></div>
    <div class="card"><h2>Lecture globale semaine</h2><p>${globalReading(summary)}</p></div>`;
  $("#saveQtyBtn")?.addEventListener("click", saveQuantities);
}

function globalReading(summary) {
  const m = dashboardMetrics(summary);
  if (m.lignesSaisies === 0) return "Aucune saisie";
  if (m.lignesNonConformes > 0) return `${m.lignesNonConformes} ligne(s) non conforme(s). Le bonus/malus est bloqué sur les produits concernés.`;
  return `Semaine conforme. Montant total bonus/malus : ${fmtEuro(m.totalEuro)}.`;
}

function renderCalendrier() {
  const items = Object.entries(HOLIDAYS_2026).map(([date, name]) => ({ date, name, dayName: new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(new Date(date)) }));
  const weekDays = DAYS.map(d => ({ name: d.name, date: dateForDay($("#weekStart").value, d.index), holiday: holidayName(dateForDay($("#weekStart").value, d.index)) }));
  $("#calendrier").innerHTML = `
    <div class="card"><h2>Semaine sélectionnée</h2><div class="calendar-grid" style="margin-top:14px;">${weekDays.map(d => `<div class="calendar-card"><strong>${d.name}</strong><br>${d.date}<br>${d.holiday ? `<span class="badge badge-holiday">${d.holiday}</span>` : `<span class="small">Jour travaillé possible</span>`}</div>`).join("")}</div></div>
    <div class="card"><h2>Jours fériés 2026 — France métropolitaine</h2><div class="table-wrap" style="margin-top:14px;"><table><thead><tr><th>Date</th><th>Jour</th><th>Fête légale</th></tr></thead><tbody>${items.map(i => `<tr><td>${i.date}</td><td>${i.dayName}</td><td>${i.name}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function renderProduits() {
  if (!canEditProducts()) { $("#produits").innerHTML = `<div class="card"><p>Accès réservé à l'admin.</p></div>`; return; }
  $("#produits").innerHTML = `
    <div class="card">
      <div class="card-header"><div><h2>Liste produits, seuils et prix</h2><p class="muted">Ces valeurs remplacent la feuille Parametres de l’Excel. Tous les seuils bonus/malus sont modifiables.</p></div><button id="addProductBtn" class="secondary-btn">Ajouter un produit</button></div>
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
    <div class="card"><h2>Utilisateurs</h2><p class="muted">Le compte email/mot de passe se crée dans Supabase Authentication. Ici, on attribue le rôle applicatif dans gr_profiles.</p>
      <div class="form-grid"><input id="newProfileId" placeholder="UUID utilisateur Supabase Auth"><input id="newProfileEmail" placeholder="Email"><input id="newProfileName" placeholder="Nom complet"><select id="newProfileRole"><option value="responsable_afp">Responsable AFP</option><option value="responsable_giffaud">Responsable Giffaud</option><option value="lecture">Lecture seule</option><option value="admin">Admin</option></select><button id="saveProfileBtn" class="primary-btn">Créer / mettre à jour profil</button></div>
      <div id="profilesTable" class="table-wrap" style="margin-top:16px;"></div>
    </div>`;
  $("#saveProfileBtn").addEventListener("click", saveProfile);
  loadProfilesTable();
}
async function loadProfilesTable() {
  const { data, error } = await sb.from("gr_profiles").select("*").order("created_at");
  if (error) { $("#profilesTable").innerHTML = error.message; return; }
  $("#profilesTable").innerHTML = `<table><thead><tr><th>Email</th><th>Nom</th><th>Rôle</th><th>Actif</th></tr></thead><tbody>${(data || []).map(p => `<tr><td>${escapeHtml(p.email)}</td><td>${escapeHtml(p.full_name || "")}</td><td>${roleLabel(p.role)}</td><td>${p.active ? "Oui" : "Non"}</td></tr>`).join("")}</tbody></table>`;
}
async function saveProfile() {
  const id = $("#newProfileId").value.trim();
  if (!id) return showMessage("Il faut l'UUID du compte créé dans Supabase Authentication.", "error");
  const payload = { id, email: $("#newProfileEmail").value.trim(), full_name: $("#newProfileName").value.trim(), role: $("#newProfileRole").value, active: true };
  const { error } = await sb.from("gr_profiles").upsert(payload, { onConflict: "id" });
  if (error) return showMessage(error.message, "error");
  showMessage("Profil enregistré."); loadProfilesTable();
}

async function ensureWeekly() {
  if (currentWeekly) return true;
  await loadWeek();
  if (!currentWeekly) { showMessage("Impossible de créer la semaine. Vérifie ton rôle utilisateur.", "error"); return false; }
  return true;
}
async function saveEntries() {
  if (!(await ensureWeekly())) return;
  const payloads = [];
  for (const input of $$('[data-field]')) {
    const productId = input.dataset.product;
    const dayIndex = Number(input.dataset.day);
    let row = payloads.find(x => x.product_id === productId && x.day_index === dayIndex);
    if (!row) {
      const product = products.find(p => p.id === productId);
      row = { weekly_id: currentWeekly.id, product_id: productId, day_index: dayIndex, work_date: dateForDay($("#weekStart").value, dayIndex), qte_ref_snapshot: product.qte_ref, updated_by: session.user.id };
      payloads.push(row);
    }
    const field = input.dataset.field;
    if (["presence_afp", "presence_giffaud"].includes(field)) row[field] = input.value === "true";
    else if (field === "commentaire_terrain") row[field] = input.value.trim();
    else row[field] = toNum(input.value);
  }
  const filtered = payloads.filter(r => r.qte_comptee !== null || r.poids_total_g !== null || r.presence_afp || r.presence_giffaud || r.commentaire_terrain);
  if (!filtered.length) return showMessage("Aucune ligne à enregistrer.", "error");
  const { error } = await sb.from("gr_control_entries").upsert(filtered, { onConflict: "weekly_id,product_id,day_index" });
  if (error) return showMessage(error.message, "error");
  await loadWeek(); renderAll(); showMessage("Saisie enregistrée.");
}
async function saveQuantities() {
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
    if (error) return showMessage(error.message, "error");
  }
  const weekNote = $("#weekNote")?.value?.trim() || "";
  const up = await sb.from("gr_weekly_headers").update({ week_note: weekNote, updated_at: new Date().toISOString() }).eq("id", currentWeekly.id);
  if (up.error) return showMessage(up.error.message, "error");
  await loadWeek(); renderAll(); showMessage("Synthèse enregistrée.");
}
async function toggleLockWeek() {
  if (!currentWeekly || !canEditProducts()) return;
  const locked = !currentWeekly.locked;
  const { error } = await sb.from("gr_weekly_headers").update({ locked, status: locked ? "validée" : "brouillon", validated_by: locked ? session.user.id : null, validated_at: locked ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", currentWeekly.id);
  if (error) return showMessage(error.message, "error");
  await loadWeek(); renderAll(); showMessage(locked ? "Semaine verrouillée." : "Semaine déverrouillée.");
}

async function boot() {
  if (!initSupabase()) return;
  $("#loginBtn").addEventListener("click", login);
  $("#loginPassword").addEventListener("keydown", e => { if (e.key === "Enter") login(); });
  $("#logoutBtn").addEventListener("click", logout);
  $$(".nav-btn").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("#weekStart").addEventListener("change", async () => { await loadWeek(); renderAll(); });
  const { data } = await sb.auth.getSession();
  if (data.session) { session = data.session; await afterLogin(); }
}

document.addEventListener("DOMContentLoaded", boot);
