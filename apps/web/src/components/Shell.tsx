import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearTokens, isAuthenticated } from "../lib/api";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/users", label: "Users" },
  { to: "/add-user", label: "Add User" },
  { to: "/scan", label: "Scan" },
];

export function Shell() {
  const navigate = useNavigate();
  const loggedIn = isAuthenticated();

  if (!loggedIn) {
    return <Navigate to="/login" replace />;
  }

  function logout() {
    clearTokens();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
            <span className="font-semibold text-gray-900">CareLens AI</span>
          </div>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive
                      ? "bg-teal-50 text-teal-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={logout}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}