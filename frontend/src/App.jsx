import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AnwesenheitPage from "./pages/AnwesenheitPage.jsx";
import FigurenPage from "./pages/FigurenPage.jsx";
import FolgenPage from "./pages/FolgenPage.jsx";
import HistoriePage from "./pages/HistoriePage.jsx";
import HomePage from "./pages/HomePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import WelcomePage from "./pages/WelcomePage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/figuren" element={<FigurenPage />} />
        <Route path="/folgen" element={<FolgenPage />} />
        <Route path="/historie" element={<HistoriePage />} />
        <Route path="/anwesenheit" element={<AnwesenheitPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
