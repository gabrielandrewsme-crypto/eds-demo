import { createClient } from "@supabase/supabase-js";

const LOGIN_USER = "explosaodesabor";
const LOGIN_PASSWORD = "eds2026";
const ADMIN_PASSWORD = "261103";
const UNITS = [
  "Nova Iguacu",
  "Belford Roxo",
  "Heliopolis",
  "Miguel Couto",
  "Posse",
  "Vila de Cava",
];
const SHIFT_SELECT =
  "id, unit_name, work_date, started_at, ended_at, opening_stock, closing_data, incidents(id, type, description, incident_date, created_at)";
const MACHINE_REPORTS_BUCKET = "machine-reports";

const app = document.querySelector("#app");
const session = {
  authenticated: false,
  currentUnit: "",
  role: "operator",
};
const state = {
  authView: "operator",
  backendReady: false,
  backendError: "",
  loadingText: "",
  currentRecord: null,
  adminRecords: [],
};

const supabaseUrl = import.meta.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowIso() {
  return new Date().toISOString();
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateTime(iso) {
  if (!iso) return "--";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hasOpeningStock(record) {
  return Boolean(record?.openingStock);
}

function isShiftClosed(record) {
  return Boolean(record?.endShift);
}

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true);
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function createEmptyRecord(unit, date = todayKey()) {
  return {
    id: null,
    unit,
    date,
    startShift: null,
    openingStock: null,
    incidents: [],
    closing: null,
    endShift: null,
  };
}

function normalizeShift(record) {
  if (!record) {
    return createEmptyRecord(session.currentUnit || UNITS[0]);
  }

  return {
    id: record.id,
    unit: record.unit_name,
    date: record.work_date,
    startShift: record.started_at,
    openingStock: record.opening_stock,
    incidents: [...(record.incidents || [])]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((incident) => ({
        id: incident.id,
        type: incident.type,
        description: incident.description,
        date: incident.incident_date,
        createdAt: incident.created_at,
      })),
    closing: record.closing_data
      ? {
          finalStock: record.closing_data.finalStock,
          sales: record.closing_data.sales,
          expenses: record.closing_data.expenses,
          machinePhoto: record.closing_data.machinePhotoUrl,
          machinePhotoPath: record.closing_data.machinePhotoPath,
          savedAt: record.closing_data.savedAt,
        }
      : null,
    endShift: record.ended_at,
  };
}

function sanitizeFileName(name) {
  return name
    .normalize("NFD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function getWeekStart(date) {
  const clone = new Date(date);
  const day = clone.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  clone.setDate(clone.getDate() + diff);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function getPeriodRange(period, baseDateKey) {
  const base = parseDateKey(baseDateKey);
  let start = new Date(base);
  let end = new Date(base);

  if (period === "week") {
    start = getWeekStart(base);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start = new Date(base.getFullYear(), base.getMonth(), 1);
    end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  } else if (period === "year") {
    start = new Date(base.getFullYear(), 0, 1);
    end = new Date(base.getFullYear(), 11, 31);
  }

  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
  };
}

function periodLabel(period) {
  return {
    day: "Dia",
    week: "Semana",
    month: "Mes",
    year: "Ano",
  }[period];
}

function summarizeFinancialRecords(records) {
  return records.reduce(
    (acc, record) => {
      const cash = record.closing?.sales.cash || 0;
      const card = record.closing?.sales.card || 0;
      const dailyCost = record.closing?.expenses.dailyCost || 0;
      const extraCost = record.closing?.expenses.extraCost || 0;
      acc.cash += cash;
      acc.card += card;
      acc.dailyCost += dailyCost;
      acc.extraCost += extraCost;
      acc.sales += cash + card;
      acc.net += cash + card - dailyCost - extraCost;
      return acc;
    },
    { cash: 0, card: 0, dailyCost: 0, extraCost: 0, sales: 0, net: 0 }
  );
}

function getRecordsByFilter(unit = "Todas") {
  return unit === "Todas"
    ? state.adminRecords
    : state.adminRecords.filter((record) => record.unit === unit);
}

function getReportRecords(unit, period, baseDateKey) {
  const unitRecords = getRecordsByFilter(unit).filter((record) => record.closing);
  const { startKey, endKey } = getPeriodRange(period, baseDateKey);
  return unitRecords.filter((record) => record.date >= startKey && record.date <= endKey);
}

function render() {
  app.innerHTML = "";
  document.body.classList.toggle("auth-shell", !session.authenticated);

  if (!session.authenticated) {
    renderLogin();
    return;
  }

  if (state.loadingText) {
    renderLoading();
    return;
  }

  if (state.backendError) {
    renderBackendError();
    return;
  }

  if (session.role === "admin") {
    renderAdminPage();
    return;
  }

  if (!session.currentUnit) {
    renderUnitSelection();
    return;
  }

  renderDashboard();
}

function renderLoading() {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-header stacked">
      <div>
        <p class="section-tag">Sincronizacao</p>
        <h2>${escapeHtml(state.loadingText)}</h2>
      </div>
    </div>
    <p class="hint">Aguarde enquanto o sistema consulta ou grava os dados no Supabase.</p>
  `;
  app.appendChild(panel);
}

function renderBackendError() {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-header stacked">
      <div>
        <p class="section-tag">Configuracao</p>
        <h2>Supabase ainda nao esta pronto</h2>
      </div>
    </div>
    <p>${escapeHtml(state.backendError)}</p>
    <p class="hint">Rode o arquivo supabase/schema.sql no SQL Editor e confirme o arquivo .env.</p>
  `;
  app.appendChild(panel);
}

function renderLogin() {
  app.appendChild(cloneTemplate("login-template"));
  const form = document.getElementById("login-form");
  const operatorButton = document.getElementById("role-operator-button");
  const adminButton = document.getElementById("role-admin-button");
  const adminDirectAccess = document.getElementById("admin-direct-access");
  const loginHint = document.getElementById("login-hint");

  function syncAuthMode() {
    const operatorMode = state.authView === "operator";
    form.classList.toggle("hidden", !operatorMode);
    adminDirectAccess.classList.toggle("hidden", operatorMode);
    operatorButton.className = `btn ${operatorMode ? "btn-primary" : "btn-secondary"}`;
    adminButton.className = `btn ${operatorMode ? "btn-secondary" : "btn-primary"}`;
    loginHint.textContent = operatorMode
      ? "Selecione Funcionario para logar e depois escolher a barraca do aparelho."
      : "Selecione ADM para entrar direto no painel administrativo.";
  }

  operatorButton.addEventListener("click", () => {
    state.authView = "operator";
    syncAuthMode();
  });

  adminButton.addEventListener("click", () => {
    state.authView = "admin";
    syncAuthMode();
  });

  syncAuthMode();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    if (
      formData.get("username") === LOGIN_USER &&
      formData.get("password") === LOGIN_PASSWORD
    ) {
      session.authenticated = true;
      session.role = "operator";
      render();
      return;
    }
    showToast("Credenciais invalidas.");
  });

  document.getElementById("login-admin-button").addEventListener("click", async () => {
    const password = window.prompt("Senha do Painel ADM:");
    if (password !== ADMIN_PASSWORD) {
      showToast("Senha administrativa invalida.");
      return;
    }

    session.authenticated = true;
    session.role = "admin";
    session.currentUnit = "";
    await runWithLoading("Carregando painel administrativo", async () => {
      await refreshAdminRecords();
    });
  });

  if (state.backendError) {
    const warning = document.createElement("div");
    warning.className = "empty-state";
    warning.innerHTML = `<strong>Backend pendente</strong><p>${escapeHtml(
      state.backendError
    )}</p>`;
    document.querySelector(".intro-panel")?.appendChild(warning);
  }
}

function renderUnitSelection() {
  app.appendChild(cloneTemplate("unit-template"));
  const select = document.querySelector('select[name="unit"]');
  const today = new Date();
  document.getElementById("today-day").textContent = String(today.getDate()).padStart(2, "0");
  document.getElementById("today-date-label").textContent = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(today);

  UNITS.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    select.appendChild(option);
  });

  document.getElementById("unit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    session.currentUnit = select.value;
    await runWithLoading("Carregando dados da unidade", async () => {
      await refreshCurrentRecord();
    });
  });
}

function renderDashboard() {
  app.appendChild(cloneTemplate("dashboard-template"));
  const record = state.currentRecord || createEmptyRecord(session.currentUnit);

  document.getElementById("session-unit").textContent = session.currentUnit;
  document.getElementById("start-status").textContent = record.startShift ? "Liberado" : "Pendente";
  document.getElementById("start-time").textContent = formatDateTime(record.startShift);
  document.getElementById("end-time").textContent = formatDateTime(record.endShift);

  document.getElementById("logout-button").addEventListener("click", () => {
    session.authenticated = false;
    session.currentUnit = "";
    session.role = "operator";
    state.currentRecord = null;
    render();
  });

  document.getElementById("start-shift").addEventListener("click", async () => {
    if (record.startShift) {
      showToast("Abertura ja registrada para esta unidade hoje.");
      return;
    }

    await runWithLoading("Registrando ponto de abertura", async () => {
      await upsertCurrentShift({
        started_at: nowIso(),
      });
      await refreshCurrentRecord();
    });
    showToast(`Ponto de abertura registrado em ${session.currentUnit}.`);
  });

  document.getElementById("admin-access").addEventListener("click", async () => {
    const password = window.prompt("Senha do Painel ADM:");
    if (password !== ADMIN_PASSWORD) {
      showToast("Senha administrativa invalida.");
      return;
    }
    await runWithLoading("Carregando painel administrativo", async () => {
      await refreshAdminRecords();
    });
    renderAdminPanel(session.currentUnit);
  });

  const wrapper = document.getElementById("operations-wrapper");
  if (!record.startShift) {
    wrapper.classList.add("locked");
    wrapper.appendChild(cloneTemplate("locked-template"));
    return;
  }

  wrapper.classList.remove("locked");
  wrapper.appendChild(cloneTemplate("operations-template"));
  hydrateOperations(record);
}

function hydrateOperations(record) {
  const openingForm = document.getElementById("opening-stock-form");
  const shortageForm = document.getElementById("shortage-form");
  const restockForm = document.getElementById("restock-form");
  const closingForm = document.getElementById("closing-form");
  const endShiftButton = document.getElementById("end-shift");
  const shiftClosed = isShiftClosed(record);

  if (record.openingStock) {
    openingForm.pipoca.value = record.openingStock.pipoca;
    openingForm.pele.value = record.openingStock.pele;
    openingForm.batataChips.value = record.openingStock.batataChips;
  }

  if (record.closing) {
    closingForm.finalPipoca.value = record.closing.finalStock.pipoca;
    closingForm.finalPele.value = record.closing.finalStock.pele;
    closingForm.finalBatataChips.value = record.closing.finalStock.batataChips;
    closingForm.cash.value = record.closing.sales.cash;
    closingForm.card.value = record.closing.sales.card;
    closingForm.dailyCost.value = record.closing.expenses.dailyCost;
    closingForm.extraCost.value = record.closing.expenses.extraCost;
    closingForm.extraDescription.value = record.closing.expenses.extraDescription;
  }

  if (shiftClosed) {
    [...openingForm.elements, ...shortageForm.elements, ...restockForm.elements, ...closingForm.elements].forEach(
      (element) => {
        element.disabled = true;
      }
    );
    endShiftButton.disabled = true;
    endShiftButton.textContent = "Barraca encerrada";
  }

  openingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (shiftClosed) {
      showToast("A barraca ja foi encerrada para esta data.");
      return;
    }

    await runWithLoading("Salvando pacotes de abertura", async () => {
      await upsertCurrentShift({
        opening_stock: {
          pipoca: Number(openingForm.pipoca.value),
          pele: Number(openingForm.pele.value),
          batataChips: Number(openingForm.batataChips.value),
        },
      });
      await refreshCurrentRecord();
    });
    showToast("Pacotes de abertura salvos.");
  });

  shortageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (shiftClosed) {
      showToast("A barraca ja foi encerrada para esta data.");
      return;
    }
    const item = shortageForm.item.value.trim();
    if (!item) return;

    await runWithLoading("Registrando falta", async () => {
      await insertIncident("Falta", item);
      shortageForm.reset();
      await refreshCurrentRecord();
      await refreshAdminRecords();
    });
  });

  restockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (shiftClosed) {
      showToast("A barraca ja foi encerrada para esta data.");
      return;
    }
    const description = restockForm.description.value.trim();
    if (!description) return;

    await runWithLoading("Registrando pedido de reposicao", async () => {
      await insertIncident("Reposicao", description);
      restockForm.reset();
      await refreshCurrentRecord();
      await refreshAdminRecords();
    });
  });

  closingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (shiftClosed) {
      showToast("A barraca ja foi encerrada para esta data.");
      return;
    }
    if (!hasOpeningStock(record)) {
      showToast("Salve primeiro os pacotes de abertura antes do fechamento.");
      return;
    }

    const file = closingForm.machinePhoto.files[0];
    if (!file && !record.closing?.machinePhotoPath) {
      showToast("Anexe a foto da maquininha para concluir o fechamento.");
      return;
    }

    await runWithLoading("Salvando fechamento e anexo", async () => {
      let machinePhotoPath = record.closing?.machinePhotoPath || "";
      let machinePhotoUrl = record.closing?.machinePhoto || "";

      if (file) {
        const upload = await uploadMachinePhoto(file, session.currentUnit, record.date);
        machinePhotoPath = upload.path;
        machinePhotoUrl = upload.url;
      }

      await upsertCurrentShift({
        closing_data: {
          finalStock: {
            pipoca: Number(closingForm.finalPipoca.value),
            pele: Number(closingForm.finalPele.value),
            batataChips: Number(closingForm.finalBatataChips.value),
          },
          sales: {
            cash: Number(closingForm.cash.value),
            card: Number(closingForm.card.value),
          },
          expenses: {
            dailyCost: Number(closingForm.dailyCost.value),
            extraCost: Number(closingForm.extraCost.value),
            extraDescription: closingForm.extraDescription.value.trim(),
          },
          machinePhotoPath,
          machinePhotoUrl,
          savedAt: nowIso(),
        },
      });
      await refreshCurrentRecord();
      await refreshAdminRecords();
    });
    showToast("Fechamento salvo com foto para auditoria.");
  });

  endShiftButton.addEventListener("click", async () => {
    if (shiftClosed) {
      showToast("Fechamento da barraca ja registrado.");
      return;
    }
    if (!hasOpeningStock(record)) {
      showToast("Preencha os pacotes de abertura antes do check-out.");
      return;
    }
    if (!record.closing) {
      showToast("Preencha o fechamento de caixa antes do check-out.");
      return;
    }

    await runWithLoading("Registrando horario de fechamento", async () => {
      await upsertCurrentShift({
        ended_at: nowIso(),
      });
      await refreshCurrentRecord();
      await refreshAdminRecords();
    });
    showToast("Horario de fechamento registrado.");
  });

  renderIncidentList(record.incidents);
}

function renderIncidentList(incidents) {
  const container = document.getElementById("incidents-list");
  container.innerHTML = "";

  if (!incidents.length) {
    container.innerHTML =
      '<div class="empty-state">Nenhuma ocorrencia registrada nesta unidade hoje.</div>';
    return;
  }

  incidents.forEach((incident) => {
    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `<strong>${escapeHtml(incident.type)}</strong><p>${escapeHtml(
      incident.description
    )}</p><p>${formatDateTime(incident.createdAt)}</p>`;
    container.appendChild(card);
  });
}

function renderAdminPanel(initialFilter = "Todas") {
  document.querySelector(".admin-overlay")?.remove();
  document.body.appendChild(cloneTemplate("admin-template"));
  paintAdminPanel(initialFilter, false);
}

function renderAdminPage() {
  app.appendChild(cloneTemplate("admin-template"));
  paintAdminPanel("Todas", true);
}

function paintAdminPanel(initialFilter, inApp) {
  const tableBody = document.getElementById("timekeeping-table");
  const adminIncidents = document.getElementById("admin-incidents");
  const gallery = document.getElementById("photo-gallery");
  const metricSales = document.getElementById("metric-sales");
  const metricOpenings = document.getElementById("metric-openings");
  const metricIncidents = document.getElementById("metric-incidents");
  const metricNet = document.getElementById("metric-net");
  const metricCash = document.getElementById("metric-cash");
  const metricCard = document.getElementById("metric-card");
  const metricDailyCost = document.getElementById("metric-daily-cost");
  const metricExtraCost = document.getElementById("metric-extra-cost");
  const financialTable = document.getElementById("financial-table");
  const filterSelect = document.getElementById("admin-unit-filter");
  const reportUnitFilter = document.getElementById("report-unit-filter");
  const reportPeriodFilter = document.getElementById("report-period-filter");
  const reportDateInput = document.getElementById("report-date-input");
  const exportReportButton = document.getElementById("export-report-button");
  const closeButton = document.getElementById("close-admin");

  const filterOptions = ["Todas", ...UNITS];
  filterSelect.innerHTML = filterOptions
    .map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`)
    .join("");
  reportUnitFilter.innerHTML = filterSelect.innerHTML;
  filterSelect.value = filterOptions.includes(initialFilter) ? initialFilter : "Todas";
  reportUnitFilter.value = filterOptions.includes(initialFilter) ? initialFilter : "Todas";
  reportDateInput.value = todayKey();

  if (inApp) {
    closeButton.textContent = "Sair do ADM";
  }

  function paint(filterUnit) {
    const records = getRecordsByFilter(filterUnit);
    const totals = summarizeFinancialRecords(records);
    const openingsToday = records.filter((record) => record.date === todayKey() && record.startShift).length;
    const incidents = records.flatMap((record) =>
      record.incidents.map((incident) => ({ ...incident, unit: record.unit }))
    );
    const photos = records.filter((record) => record.closing?.machinePhoto);

    metricSales.textContent = formatCurrency(totals.sales);
    metricOpenings.textContent = String(openingsToday);
    metricIncidents.textContent = String(incidents.length);
    metricNet.textContent = formatCurrency(totals.net);
    metricCash.textContent = formatCurrency(totals.cash);
    metricCard.textContent = formatCurrency(totals.card);
    metricDailyCost.textContent = formatCurrency(totals.dailyCost);
    metricExtraCost.textContent = formatCurrency(totals.extraCost);

    tableBody.innerHTML = "";
    if (!records.length) {
      tableBody.innerHTML = '<tr><td colspan="5">Nenhum registro encontrado.</td></tr>';
    } else {
      records.forEach((record) => {
        const status = record.endShift ? "Fechada" : record.startShift ? "Aberta" : "Sem ponto";
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${escapeHtml(record.date)}</td>
          <td>${escapeHtml(record.unit)}</td>
          <td>${escapeHtml(formatDateTime(record.startShift))}</td>
          <td>${escapeHtml(formatDateTime(record.endShift))}</td>
          <td>${escapeHtml(status)}</td>
        `;
        tableBody.appendChild(row);
      });
    }

    financialTable.innerHTML = "";
    const closings = records.filter((record) => record.closing);
    if (!closings.length) {
      financialTable.innerHTML =
        '<tr><td colspan="7">Nenhum fechamento de caixa encontrado para este filtro.</td></tr>';
    } else {
      closings.forEach((record) => {
        const cash = record.closing.sales.cash || 0;
        const card = record.closing.sales.card || 0;
        const dailyCost = record.closing.expenses.dailyCost || 0;
        const extraCost = record.closing.expenses.extraCost || 0;
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${escapeHtml(record.date)}</td>
          <td>${escapeHtml(record.unit)}</td>
          <td>${escapeHtml(formatCurrency(cash))}</td>
          <td>${escapeHtml(formatCurrency(card))}</td>
          <td>${escapeHtml(formatCurrency(dailyCost))}</td>
          <td>${escapeHtml(formatCurrency(extraCost))}</td>
          <td>${escapeHtml(formatCurrency(cash + card - dailyCost - extraCost))}</td>
        `;
        financialTable.appendChild(row);
      });
    }

    adminIncidents.innerHTML = "";
    if (!incidents.length) {
      adminIncidents.innerHTML = '<div class="empty-state">Nenhuma falta ou pedido registrado.</div>';
    } else {
      incidents.forEach((incident) => {
        const card = document.createElement("article");
        card.className = "list-card";
        card.innerHTML = `<strong>${escapeHtml(incident.type)} - ${escapeHtml(
          incident.unit
        )}</strong><p>${escapeHtml(incident.description)}</p><p>${escapeHtml(
          incident.date
        )}</p>`;
        adminIncidents.appendChild(card);
      });
    }

    gallery.innerHTML = "";
    if (!photos.length) {
      gallery.innerHTML = '<div class="empty-state">Nenhuma foto de maquininha enviada ainda.</div>';
    } else {
      photos.forEach((record) => {
        const card = document.createElement("article");
        card.className = "gallery-card";
        card.innerHTML = `
          <img src="${escapeHtml(record.closing.machinePhoto)}" alt="Relatorio da maquininha da unidade ${escapeHtml(
            record.unit
          )}" />
          <div>
            <strong>${escapeHtml(record.unit)}</strong>
            <p>${escapeHtml(record.date)}</p>
            <p>Dinheiro: ${escapeHtml(formatCurrency(record.closing.sales.cash || 0))}</p>
            <p>Cartao: ${escapeHtml(formatCurrency(record.closing.sales.card || 0))}</p>
          </div>
        `;
        gallery.appendChild(card);
      });
    }
  }

  filterSelect.addEventListener("change", () => paint(filterSelect.value));
  exportReportButton.addEventListener("click", () => {
    exportFinancialReport(
      reportUnitFilter.value,
      reportPeriodFilter.value,
      reportDateInput.value || todayKey()
    );
  });
  closeButton.addEventListener("click", () => {
    if (inApp) {
      session.authenticated = false;
      session.role = "operator";
      session.currentUnit = "";
      render();
      return;
    }
    document.querySelector(".admin-overlay")?.remove();
  });

  paint(filterSelect.value);
}

function exportFinancialReport(unit, period, baseDateKey) {
  const records = getReportRecords(unit, period, baseDateKey);
  const totals = summarizeFinancialRecords(records);
  const range = getPeriodRange(period, baseDateKey);
  const reportTitle = `Relatorio Financeiro ${periodLabel(period)}`;
  const reportUnit = unit === "Todas" ? "Todas as unidades" : unit;
  const reportDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
    parseDateKey(baseDateKey)
  );
  const logoUrl = new URL("/eds.png", window.location.origin).href;

  const rows = records.length
    ? records
        .map((record) => {
          const cash = record.closing.sales.cash || 0;
          const card = record.closing.sales.card || 0;
          const dailyCost = record.closing.expenses.dailyCost || 0;
          const extraCost = record.closing.expenses.extraCost || 0;
          const net = cash + card - dailyCost - extraCost;
          return `
            <tr>
              <td>${escapeHtml(record.date)}</td>
              <td>${escapeHtml(record.unit)}</td>
              <td>${escapeHtml(formatCurrency(cash))}</td>
              <td>${escapeHtml(formatCurrency(card))}</td>
              <td>${escapeHtml(formatCurrency(dailyCost))}</td>
              <td>${escapeHtml(formatCurrency(extraCost))}</td>
              <td>${escapeHtml(formatCurrency(net))}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="7">Nenhum fechamento encontrado neste periodo.</td></tr>';

  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    showToast("Nao foi possivel abrir a janela de impressao.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${escapeHtml(reportTitle)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
          h1, h2, p { margin: 0 0 12px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
          .header img { width: 72px; height: 72px; object-fit: cover; border-radius: 14px; }
          .meta, .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
          .card { border: 1px solid #d7dce5; border-radius: 12px; padding: 14px; background: #f8fafc; }
          .card span { display: block; color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 18px; }
          th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 13px; }
          th { background: #f3f4f6; }
          @media print { body { margin: 16px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>${escapeHtml(reportTitle)}</h1>
            <p>EDS System - Explosao de Sabor</p>
          </div>
          <img src="${escapeHtml(logoUrl)}" alt="Logo EDS" />
        </div>
        <div class="meta">
          <div class="card"><span>Unidade</span><strong>${escapeHtml(reportUnit)}</strong></div>
          <div class="card"><span>Data base</span><strong>${escapeHtml(reportDate)}</strong></div>
          <div class="card"><span>Periodo apurado</span><strong>${escapeHtml(
            `${range.startKey} ate ${range.endKey}`
          )}</strong></div>
          <div class="card"><span>Registros</span><strong>${escapeHtml(records.length)}</strong></div>
        </div>
        <div class="metrics">
          <div class="card"><span>Vendas brutas</span><strong>${escapeHtml(
            formatCurrency(totals.sales)
          )}</strong></div>
          <div class="card"><span>Liquido de caixa</span><strong>${escapeHtml(
            formatCurrency(totals.net)
          )}</strong></div>
          <div class="card"><span>Dinheiro</span><strong>${escapeHtml(
            formatCurrency(totals.cash)
          )}</strong></div>
          <div class="card"><span>Cartao</span><strong>${escapeHtml(
            formatCurrency(totals.card)
          )}</strong></div>
          <div class="card"><span>Diarias</span><strong>${escapeHtml(
            formatCurrency(totals.dailyCost)
          )}</strong></div>
          <div class="card"><span>Custos extras</span><strong>${escapeHtml(
            formatCurrency(totals.extraCost)
          )}</strong></div>
        </div>
        <h2>Detalhamento por fechamento</h2>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Unidade</th>
              <th>Dinheiro</th>
              <th>Cartao</th>
              <th>Diaria</th>
              <th>Extras</th>
              <th>Liquido</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

async function verifyBackend() {
  if (!supabase) {
    state.backendError =
      "As variaveis SUPABASE_URL e SUPABASE_ANON_KEY nao foram encontradas. Preencha o arquivo .env.";
    render();
    return;
  }

  const { error } = await supabase.from("shifts").select("id").limit(1);
  if (error) {
    const message = error.message || "";
    if (message.includes("relation") || message.includes("does not exist")) {
      state.backendError =
        "As tabelas do projeto ainda nao existem no Supabase. Rode o arquivo supabase/schema.sql no SQL Editor.";
    } else {
      state.backendError = `Nao foi possivel acessar o Supabase: ${message}`;
    }
    render();
    return;
  }

  state.backendReady = true;
  render();
}

async function runWithLoading(text, action) {
  state.loadingText = text;
  render();
  try {
    await action();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Ocorreu um erro inesperado.");
  } finally {
    state.loadingText = "";
    render();
  }
}

async function refreshCurrentRecord() {
  const { data, error } = await supabase
    .from("shifts")
    .select(SHIFT_SELECT)
    .eq("unit_name", session.currentUnit)
    .eq("work_date", todayKey())
    .maybeSingle();

  if (error) throw new Error(error.message);
  state.currentRecord = data ? normalizeShift(data) : createEmptyRecord(session.currentUnit);
}

async function refreshAdminRecords() {
  const { data, error } = await supabase
    .from("shifts")
    .select(SHIFT_SELECT)
    .order("work_date", { ascending: false })
    .order("started_at", { ascending: false });

  if (error) throw new Error(error.message);
  state.adminRecords = (data || []).map(normalizeShift);
}

async function upsertCurrentShift(fields) {
  const payload = {
    unit_name: session.currentUnit,
    work_date: todayKey(),
    updated_at: nowIso(),
    ...fields,
  };

  const { error } = await supabase.from("shifts").upsert(payload, {
    onConflict: "unit_name,work_date",
  });
  if (error) throw new Error(error.message);
}

async function ensureCurrentShiftId() {
  if (!state.currentRecord?.id) {
    await refreshCurrentRecord();
  }

  if (!state.currentRecord?.id) {
    throw new Error("A barraca precisa ter um ponto iniciado antes de registrar ocorrencias.");
  }

  return state.currentRecord.id;
}

async function insertIncident(type, description) {
  const shiftId = await ensureCurrentShiftId();
  const { error } = await supabase.from("incidents").insert({
    shift_id: shiftId,
    unit_name: session.currentUnit,
    type,
    description,
    incident_date: todayKey(),
    created_at: nowIso(),
  });
  if (error) throw new Error(error.message);
}

async function uploadMachinePhoto(file, unit, dateKey) {
  const safeUnit = sanitizeFileName(unit);
  const safeName = sanitizeFileName(file.name || `maquininha-${Date.now()}.png`);
  const path = `${dateKey}/${safeUnit}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(MACHINE_REPORTS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/png",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(MACHINE_REPORTS_BUCKET).getPublicUrl(path);
  return {
    path,
    url: data.publicUrl,
  };
}

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  });
}

render();
verifyBackend();
