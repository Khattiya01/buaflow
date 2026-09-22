import { Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login.tsx";
import Tasks from "./pages/Tasks.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/tasks" element={<Tasks />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
