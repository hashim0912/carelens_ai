import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Navigate, Outlet, useNavigate } from "react-router-dom";
import { clearTokens, isAuthenticated } from "../lib/api";
import { GlobalHeader } from "./shell/GlobalHeader";
import { NavSidebar } from "./shell/NavSidebar";

export function Shell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loggedIn = isAuthenticated();

  if (!loggedIn) {
    return <Navigate to="/login" replace />;
  }

  function logout() {
    clearTokens();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <NavSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        className="hidden lg:flex"
      />

      <AnimatePresence>
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative h-full w-64 shadow-pop"
            >
              <NavSidebar
                collapsed={false}
                onToggle={() => setDrawerOpen(false)}
                variant="drawer"
                onNavigate={() => setDrawerOpen(false)}
              />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <GlobalHeader onOpenMenu={() => setDrawerOpen(true)} onLogout={logout} />
        <main className="flex-1 px-4 py-6 lg:px-7 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}