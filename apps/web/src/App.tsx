import { Navigate, createBrowserRouter } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AddUserPage } from "./pages/AddUserPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ScanPage } from "./pages/ScanPage";
import { UsersPage } from "./pages/UsersPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/users", element: <UsersPage /> },
      { path: "/add-user", element: <AddUserPage /> },
      { path: "/scan", element: <ScanPage /> },
    ],
  },
]);