Auth.requireAuthOrRedirect();

const state = {
  user: Auth.getUser(),
  projects: [],
  currentProjectId: null,
  members: [],
  tasks: [],
  view: "list", // "list" | "kanban"
  filters: { status: "", priority: "", assignee_id: "" },
  aiSuggestions: [], // working copy of AI-suggested subtasks, editable before applying
};

const STATUS_LABELS = { todo: "To do", in_progress: "In progress", done: "Done" };
const PRIORITY_LABELS = { low: "Low", medium: "Medium", high: "High" };

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  renderUserChrome();
  bindGlobalEvents();
  await loadProjects();
});

function renderUserChrome() {
  const u = state.user;
  document.getElementById("user-avatar").textContent = initials(u?.name);
  document.getElementById("user-name").textContent = u?.name || "—";
  document.getElementById("user-email").textContent = u?.email || "—";
}

function bindGlobalEvents() {
  document.getElementById("btn-logout").addEventListener("click", () => {
    Auth.clear();
    window.location.href = "index.html";
  });

  document.getElementById("btn-new-project").addEventListener("click", () => openProjectModal());
  document.getElementById("btn-new-project-empty").addEventListener("click", () => openProjectModal());

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.getElementById("form-project").addEventListener("submit", handleProjectSubmit);
  document.getElementById("form-task").addEventListener("submit", handleTaskSubmit);
  document.getElementById("task-delete-btn").addEventListener("click", handleTaskDelete);
  document.getElementById("form-add-member").addEventListener("submit", handleAddMember);

  document.getElementById("btn-new-task").addEventListener("click", () => openTaskModal());
  document.getElementById("btn-manage-members").addEventListener("click", openMembersModal);
  document.getElementById("btn-open-ai").addEventListener("click", openAiModal);
  document.getElementById("ai-generate-btn").addEventListener("click", handleAiGenerate);
  document.getElementById("ai-apply-btn").addEventListener("click", handleAiApply);

  document.getElementById("view-list").addEventListener("click", () => setView("list"));
  document.getElementById("view-kanban").addEventListener("click", () => setView("kanban"));

  document.getElementById("filter-status").addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    loadTasks();
  });
  document.getElementById("filter-priority").addEventListener("change", (e) => {
    state.filters.priority = e.target.value;
    loadTasks();
  });
  document.getElementById("filter-assignee").addEventListener("change", (e) => {
    state.filters.assignee_id = e.target.value;
    loadTasks();
  });
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

async function loadProjects() {
  try {
    state.projects = await apiRequest("/projects");
  } catch (err) {
    showToast(err.message, "error");
    return;
  }
  renderProjectList();

  if (state.projects.length && !state.currentProjectId) {
    selectProject(state.projects[0].id);
  } else if (!state.projects.length) {
    document.getElementById("no-project-state").style.display = "block";
    document.getElementById("project-view").style.display = "none";
  }
}

function renderProjectList() {
  const list = document.getElementById("project-list");
  list.innerHTML = "";
  state.projects.forEach((p) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = p.id === state.currentProjectId ? "active" : "";
    btn.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="count">${p.task_count}</span>`;
    btn.addEventListener("click", () => selectProject(p.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

async function selectProject(projectId) {
  state.currentProjectId = projectId;
  renderProjectList();

  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  document.getElementById("no-project-state").style.display = "none";
  document.getElementById("project-view").style.display = "block";
  document.getElementById("project-title").textContent = project.name;
  document.getElementById("project-description").textContent = project.description || "";

  await loadMembers();
  await loadTasks();
}

function openProjectModal() {
  document.getElementById("project-modal-title").textContent = "New project";
  document.getElementById("project-submit-btn").textContent = "Create project";
  document.getElementById("proj-name").value = "";
  document.getElementById("proj-desc").value = "";
  document.getElementById("project-form-error").classList.remove("visible");
  openModal("modal-project");
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const errBox = document.getElementById("project-form-error");
  errBox.classList.remove("visible");
  const name = document.getElementById("proj-name").value.trim();
  const description = document.getElementById("proj-desc").value.trim();

  try {
    const project = await apiRequest("/projects", { method: "POST", body: { name, description } });
    closeModal("modal-project");
    await loadProjects();
    selectProject(project.id);
    showToast("Project created", "success");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("visible");
  }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

async function loadMembers() {
  try {
    state.members = await apiRequest(`/projects/${state.currentProjectId}/members`);
  } catch (err) {
    showToast(err.message, "error");
    return;
  }
  const assigneeSelects = [document.getElementById("filter-assignee"), document.getElementById("task-assignee")];
  assigneeSelects.forEach((sel, idx) => {
    const keepValue = sel.value;
    sel.innerHTML = idx === 0 ? `<option value="">Everyone</option>` : `<option value="">Unassigned</option>`;
    state.members.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.user_id;
      opt.textContent = m.name;
      sel.appendChild(opt);
    });
    sel.value = keepValue;
  });
}

function openMembersModal() {
  renderMembersList();
  document.getElementById("members-form-error").classList.remove("visible");
  document.getElementById("member-email").value = "";
  openModal("modal-members");
}

function renderMembersList() {
  const list = document.getElementById("members-list");
  list.innerHTML = "";
  state.members.forEach((m) => {
    const li = document.createElement("li");
    li.className = "subtask-row";
    li.innerHTML = `
      <div class="st-top" style="justify-content: space-between;">
        <div>
          <div style="font-weight:600;">${escapeHtml(m.name)} ${m.role === "owner" ? '<span class="badge badge-priority-medium">Owner</span>' : ""}</div>
          <div style="color:var(--ink-soft); font-size:13px;">${escapeHtml(m.email)}</div>
        </div>
        ${m.role !== "owner" ? `<button class="btn btn-danger-ghost btn-sm" data-remove="${m.user_id}">Remove</button>` : ""}
      </div>`;
    list.appendChild(li);
  });
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await apiRequest(`/projects/${state.currentProjectId}/members/${btn.dataset.remove}`, { method: "DELETE" });
        await loadMembers();
        renderMembersList();
        showToast("Member removed", "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

async function handleAddMember(e) {
  e.preventDefault();
  const errBox = document.getElementById("members-form-error");
  errBox.classList.remove("visible");
  const email = document.getElementById("member-email").value.trim();
  try {
    await apiRequest(`/projects/${state.currentProjectId}/members`, { method: "POST", body: { email } });
    document.getElementById("member-email").value = "";
    await loadMembers();
    renderMembersList();
    showToast("Member added", "success");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("visible");
  }
}

// ---------------------------------------------------------------------------
// Tasks — loading + view rendering
// ---------------------------------------------------------------------------

async function loadTasks() {
  if (!state.currentProjectId) return;
  const params = new URLSearchParams();
  if (state.filters.status) params.set("status", state.filters.status);
  if (state.filters.priority) params.set("priority", state.filters.priority);
  if (state.filters.assignee_id) params.set("assignee_id", state.filters.assignee_id);
  const qs = params.toString() ? `?${params.toString()}` : "";

  try {
    state.tasks = await apiRequest(`/projects/${state.currentProjectId}/tasks${qs}`);
  } catch (err) {
    showToast(err.message, "error");
    return;
  }
  renderTasks();
  refreshProjectCountBadge();
}

function refreshProjectCountBadge() {
  const p = state.projects.find((p) => p.id === state.currentProjectId);
  if (p) {
    // Only accurate for unfiltered view, but good enough for a sidebar hint.
    apiRequest(`/projects/${state.currentProjectId}`).then((fresh) => {
      p.task_count = fresh.task_count;
      renderProjectList();
    }).catch(() => {});
  }
}

function setView(view) {
  state.view = view;
  document.getElementById("view-list").classList.toggle("active", view === "list");
  document.getElementById("view-kanban").classList.toggle("active", view === "kanban");
  document.getElementById("list-view").style.display = view === "list" ? "block" : "none";
  document.getElementById("kanban-view").style.display = view === "kanban" ? "block" : "none";
}

function renderTasks() {
  renderListView();
  renderKanbanView();
}

function renderListView() {
  const tbody = document.getElementById("task-table-body");
  tbody.innerHTML = "";
  document.getElementById("table-empty").style.display = state.tasks.length ? "none" : "block";

  state.tasks.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="task-title-cell">${escapeHtml(t.title)}${t.ai_generated ? '<span class="ai-tag">✦ AI</span>' : ""}</td>
      <td><span class="badge badge-status-${t.status}">${STATUS_LABELS[t.status]}</span></td>
      <td><span class="badge badge-priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span></td>
      <td><span class="due-date ${isOverdue(t.due_date, t.status) ? "overdue" : ""}">${formatDate(t.due_date)}</span></td>
      <td class="mono">${t.estimated_hours != null ? t.estimated_hours + "h" : "—"}</td>
      <td>${t.assignee_name ? `<span class="assignee-chip"><span class="avatar-sm">${initials(t.assignee_name)}</span>${escapeHtml(t.assignee_name)}</span>` : '<span style="color:var(--ink-soft);">Unassigned</span>'}</td>
    `;
    tr.addEventListener("click", () => openTaskModal(t));
    tbody.appendChild(tr);
  });
}

function renderKanbanView() {
  ["todo", "in_progress", "done"].forEach((status) => {
    const container = document.getElementById(`cards-${status}`);
    container.innerHTML = "";
    const tasksForCol = state.tasks.filter((t) => t.status === status);
    document.getElementById(`count-${status}`).textContent = tasksForCol.length;

    if (!tasksForCol.length) {
      container.innerHTML = `<div class="kanban-empty">No tasks</div>`;
    }

    tasksForCol.forEach((t) => {
      const card = document.createElement("div");
      card.className = "kanban-card";
      card.draggable = true;
      card.dataset.taskId = t.id;
      card.innerHTML = `
        <div class="kc-title">${escapeHtml(t.title)}</div>
        <div class="kc-meta">
          <span class="badge badge-priority-${t.priority}">${PRIORITY_LABELS[t.priority]}</span>
          ${t.estimated_hours != null ? `<span class="mono" style="font-size:12px; color:var(--ink-soft);">${t.estimated_hours}h</span>` : ""}
        </div>
        <div class="kc-meta" style="margin-top:6px;">
          <span class="due-date ${isOverdue(t.due_date, t.status) ? "overdue" : ""}">${formatDate(t.due_date)}</span>
          ${t.assignee_name ? `<span class="assignee-chip"><span class="avatar-sm">${initials(t.assignee_name)}</span></span>` : ""}
        </div>
        ${t.ai_generated ? '<span class="ai-tag">✦ AI-generated</span>' : ""}
      `;
      card.addEventListener("click", (e) => {
        if (card.dataset.dragging) return;
        openTaskModal(t);
      });
      card.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", String(t.id));
        e.dataTransfer.effectAllowed = "move";
      });
      container.appendChild(card);
    });
  });

  document.querySelectorAll(".kanban-col").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      e.preventDefault();
      col.classList.add("drag-over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const taskId = parseInt(e.dataTransfer.getData("text/plain"), 10);
      const newStatus = col.dataset.status;
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      try {
        await apiRequest(`/projects/${state.currentProjectId}/tasks/${taskId}`, {
          method: "PATCH",
          body: { status: newStatus },
        });
        await loadTasks();
        showToast(`Moved to ${STATUS_LABELS[newStatus]}`, "success");
      } catch (err) {
        showToast(err.message, "error");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Task modal (create / edit / delete)
// ---------------------------------------------------------------------------

function openTaskModal(task = null) {
  const errBox = document.getElementById("task-form-error");
  errBox.classList.remove("visible");
  document.getElementById("task-id").value = task ? task.id : "";
  document.getElementById("task-title").value = task ? task.title : "";
  document.getElementById("task-desc").value = task ? task.description || "" : "";
  document.getElementById("task-status").value = task ? task.status : "todo";
  document.getElementById("task-priority").value = task ? task.priority : "medium";
  document.getElementById("task-due").value = task ? task.due_date || "" : "";
  document.getElementById("task-estimate").value = task && task.estimated_hours != null ? task.estimated_hours : "";
  document.getElementById("task-assignee").value = task && task.assignee_id ? task.assignee_id : "";

  document.getElementById("task-modal-title").textContent = task ? "Edit task" : "New task";
  document.getElementById("task-submit-btn").textContent = task ? "Save changes" : "Create task";
  document.getElementById("task-delete-btn").style.display = task ? "inline-flex" : "none";

  openModal("modal-task");
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const errBox = document.getElementById("task-form-error");
  errBox.classList.remove("visible");

  const id = document.getElementById("task-id").value;
  const body = {
    title: document.getElementById("task-title").value.trim(),
    description: document.getElementById("task-desc").value.trim() || null,
    status: document.getElementById("task-status").value,
    priority: document.getElementById("task-priority").value,
    due_date: document.getElementById("task-due").value || null,
    estimated_hours: document.getElementById("task-estimate").value
      ? parseInt(document.getElementById("task-estimate").value, 10)
      : null,
    assignee_id: document.getElementById("task-assignee").value
      ? parseInt(document.getElementById("task-assignee").value, 10)
      : null,
  };

  try {
    if (id) {
      await apiRequest(`/projects/${state.currentProjectId}/tasks/${id}`, { method: "PATCH", body });
      showToast("Task updated", "success");
    } else {
      await apiRequest(`/projects/${state.currentProjectId}/tasks`, { method: "POST", body });
      showToast("Task created", "success");
    }
    closeModal("modal-task");
    await loadTasks();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("visible");
  }
}

async function handleTaskDelete() {
  const id = document.getElementById("task-id").value;
  if (!id) return;
  if (!confirm("Delete this task? This cannot be undone.")) return;
  try {
    await apiRequest(`/projects/${state.currentProjectId}/tasks/${id}`, { method: "DELETE" });
    closeModal("modal-task");
    await loadTasks();
    showToast("Task deleted", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ---------------------------------------------------------------------------
// AI breakdown — the standout feature
// ---------------------------------------------------------------------------

function openAiModal() {
  document.getElementById("ai-goal").value = "";
  document.getElementById("ai-form-error").classList.remove("visible");
  document.getElementById("ai-subtask-list").innerHTML = "";
  document.getElementById("ai-summary-bar").style.display = "none";
  document.getElementById("ai-apply-row").style.display = "none";
  state.aiSuggestions = [];
  openModal("modal-ai");
  document.getElementById("ai-goal").focus();
}

async function handleAiGenerate() {
  const errBox = document.getElementById("ai-form-error");
  errBox.classList.remove("visible");
  const goal = document.getElementById("ai-goal").value.trim();
  if (goal.length < 3) {
    errBox.textContent = "Describe the goal in a bit more detail.";
    errBox.classList.add("visible");
    return;
  }

  const loading = document.getElementById("ai-loading");
  const genBtn = document.getElementById("ai-generate-btn");
  loading.classList.add("visible");
  genBtn.disabled = true;
  document.getElementById("ai-subtask-list").innerHTML = "";
  document.getElementById("ai-summary-bar").style.display = "none";
  document.getElementById("ai-apply-row").style.display = "none";

  try {
    const result = await apiRequest("/ai/breakdown", {
      method: "POST",
      body: { project_id: state.currentProjectId, goal },
    });
    state.aiSuggestions = result.subtasks;
    renderAiSuggestions();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("visible");
  } finally {
    loading.classList.remove("visible");
    genBtn.disabled = false;
  }
}

function renderAiSuggestions() {
  const list = document.getElementById("ai-subtask-list");
  list.innerHTML = "";

  state.aiSuggestions.forEach((s, idx) => {
    const li = document.createElement("li");
    li.className = "subtask-row";
    li.innerHTML = `
      <div class="st-top">
        <input type="text" data-field="title" data-idx="${idx}" value="${escapeHtml(s.title)}" />
        <button type="button" class="btn-icon st-remove" data-remove="${idx}" title="Remove">&times;</button>
      </div>
      <div class="st-desc">
        <textarea data-field="description" data-idx="${idx}" rows="2">${escapeHtml(s.description)}</textarea>
      </div>
      <div class="st-meta">
        <div>
          <label style="margin-bottom:3px;">Estimate (hrs)</label>
          <input type="number" min="0" max="2000" data-field="estimated_hours" data-idx="${idx}" value="${s.estimated_hours}" />
        </div>
        <div>
          <label style="margin-bottom:3px;">Priority</label>
          <select data-field="priority" data-idx="${idx}">
            <option value="low" ${s.priority === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${s.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${s.priority === "high" ? "selected" : ""}>High</option>
          </select>
        </div>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll("[data-field]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      const field = e.target.dataset.field;
      let value = e.target.value;
      if (field === "estimated_hours") value = value ? parseInt(value, 10) : 0;
      state.aiSuggestions[idx][field] = value;
    });
  });
  list.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.remove, 10);
      state.aiSuggestions.splice(idx, 1);
      renderAiSuggestions();
      updateAiSummaryBar();
    });
  });

  updateAiSummaryBar();
}

function updateAiSummaryBar() {
  const bar = document.getElementById("ai-summary-bar");
  const applyRow = document.getElementById("ai-apply-row");
  if (!state.aiSuggestions.length) {
    bar.style.display = "none";
    applyRow.style.display = "none";
    return;
  }
  const totalHours = state.aiSuggestions.reduce((sum, s) => sum + (parseInt(s.estimated_hours, 10) || 0), 0);
  bar.style.display = "flex";
  bar.textContent = `${state.aiSuggestions.length} subtasks · ${totalHours}h estimated total — edit anything above before adding.`;
  applyRow.style.display = "flex";
}

async function handleAiApply() {
  const errBox = document.getElementById("ai-form-error");
  errBox.classList.remove("visible");
  if (!state.aiSuggestions.length) return;

  const applyBtn = document.getElementById("ai-apply-btn");
  applyBtn.disabled = true;
  applyBtn.textContent = "Adding tasks…";

  try {
    await apiRequest("/ai/breakdown/apply", {
      method: "POST",
      body: {
        project_id: state.currentProjectId,
        subtasks: state.aiSuggestions.map((s) => ({
          title: s.title,
          description: s.description,
          estimated_hours: parseInt(s.estimated_hours, 10) || 0,
          priority: s.priority,
        })),
      },
    });
    closeModal("modal-ai");
    await loadTasks();
    showToast(`Added ${state.aiSuggestions.length} tasks to the board`, "success");
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.add("visible");
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = "Add these tasks to the project";
  }
}
