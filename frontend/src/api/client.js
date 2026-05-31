const API_BASE = "/api";

function getToken() {
  return localStorage.getItem("dancefans_token");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(data?.error || `Fehler ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function downloadCsv(path, fallbackFilename) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Fehler ${res.status}`;
    try {
      msg = JSON.parse(text)?.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : fallbackFilename;
  return { blob, filename };
}

async function uploadCsv(path, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const error = new Error(data?.error || `Fehler ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export const api = {
  login: (username, password) =>
    request("/login", {
      method: "POST",
      body: { username, password },
      auth: false,
    }),
  logout: () => request("/logout", { method: "POST" }),
  me: () => request("/me"),
  courses: () => request("/courses", { auth: false }),
  users: () => request("/users"),
  createUser: (payload) =>
    request("/users", { method: "POST", body: payload }),
  updateUser: (userId, payload) =>
    request(`/users/${userId}`, { method: "PUT", body: payload }),
  deleteUser: (userId) =>
    request(`/users/${userId}`, { method: "DELETE" }),
  exportUsers: () => downloadCsv("/users/export", "nutzer-export.csv"),
  importUsers: (file) => uploadCsv("/users/import", file),
  exportFigures: (courseId) =>
    downloadCsv(`/figures/${courseId}/export`, "figuren-export.csv"),
  importFigures: (courseId, file) =>
    uploadCsv(`/figures/${courseId}/import`, file),
  exportSequences: (courseId) =>
    downloadCsv(`/sequences/${courseId}/export`, "folgen-export.csv"),
  importSequences: (courseId, file) =>
    uploadCsv(`/sequences/${courseId}/import`, file),
  exportHistory: (courseId) =>
    downloadCsv(`/history/${courseId}/export`, "historie-export.csv"),
  importHistory: (courseId, file) =>
    uploadCsv(`/history/${courseId}/import`, file),
  exportAttendance: (courseId) =>
    downloadCsv(`/attendance/${courseId}/export`, "anwesenheit-export.csv"),
  importAttendance: (courseId, file) =>
    uploadCsv(`/attendance/${courseId}/import`, file),
  dances: () => request("/dances", { auth: false }),
  figures: (courseId) => request(`/figures/${courseId}`),
  addFigure: (courseId, payload) =>
    request(`/figures/${courseId}`, { method: "POST", body: payload }),
  sequences: (courseId) => request(`/sequences/${courseId}`),
  addSequence: (courseId, payload) =>
    request(`/sequences/${courseId}`, { method: "POST", body: payload }),
  updateSequence: (courseId, id, payload) =>
    request(`/sequences/${courseId}/${id}`, { method: "PUT", body: payload }),
  deleteSequence: (courseId, id) =>
    request(`/sequences/${courseId}/${id}`, { method: "DELETE" }),
  updateFigureVisibility: (courseId, items) =>
    request(`/figures/${courseId}/visibility`, {
      method: "PUT",
      body: { items },
    }),
  updateSequenceVisibility: (courseId, items) =>
    request(`/sequences/${courseId}/visibility`, {
      method: "PUT",
      body: { items },
    }),
  history: (courseId) => request(`/history/${courseId}`),
  allHistory: (courseId) => request(`/history/${courseId}/all`),
  addHistory: (courseId, payload) =>
    request(`/history/${courseId}`, { method: "POST", body: payload }),
  updateHistory: (courseId, id, payload) =>
    request(`/history/${courseId}/${id}`, { method: "PUT", body: payload }),
  deleteHistory: (courseId, id) =>
    request(`/history/${courseId}/${id}`, { method: "DELETE" }),
  attendance: (courseId) => request(`/attendance/${courseId}`),
  allAttendance: (courseId) => request(`/attendance/${courseId}/all`),
  fourCards: (courseId) => request(`/four-cards/${courseId}`),
  setFourCardPaid: (courseId, userId, paid) =>
    request(`/four-cards/${courseId}/${userId}/paid`, {
      method: "PUT",
      body: { paid },
    }),
  addAttendance: (courseId, payload) =>
    request(`/attendance/${courseId}`, { method: "POST", body: payload }),
  deleteAttendance: (courseId, attendanceId) =>
    request(`/attendance/${courseId}/${attendanceId}`, { method: "DELETE" }),
};
