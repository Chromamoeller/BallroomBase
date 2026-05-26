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
  dances: () => request("/dances", { auth: false }),
  figures: (courseId) => request(`/figures/${courseId}`),
  sequences: (courseId) => request(`/sequences/${courseId}`),
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
  addHistory: (courseId, payload) =>
    request(`/history/${courseId}`, { method: "POST", body: payload }),
  updateHistory: (courseId, id, payload) =>
    request(`/history/${courseId}/${id}`, { method: "PUT", body: payload }),
  deleteHistory: (courseId, id) =>
    request(`/history/${courseId}/${id}`, { method: "DELETE" }),
  attendance: (courseId) => request(`/attendance/${courseId}`),
  addAttendance: (courseId, payload) =>
    request(`/attendance/${courseId}`, { method: "POST", body: payload }),
};
