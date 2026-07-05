import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Send, QrCode, History, Settings } from "lucide-react";
import { cn } from "../lib/utils";
import Tutorial from "./Tutorial";

export default function Layout() {
  const location = useLocation();

  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "History", path: "/history", icon: History },
    { name: "Scan", path: "/scan", icon: QrCode, center: true },
    { name: "Send", path: "/send", icon: Send },
    { name: "Settings", path: "/settings", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-zinc-950 text-zinc-50 relative overflow-hidden shadow-2xl sm:border-x sm:border-zinc-800">
      <Tutorial />
      <div className="flex-1 overflow-y-auto pb-20 no-scrollbar">
        <Outlet />
      </div>

      <nav className="absolute bottom-0 w-full bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-800/50 pb-safe">
        <ul className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            if (item.center) {
              return (
                <li key={item.path} className="relative -top-6">
                  <Link
                    to={item.path}
                    className="flex items-center justify-center w-14 h-14 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/30 text-white transform transition-transform active:scale-95"
                  >
                    <Icon className="w-6 h-6" />
                  </Link>
                </li>
              );
            }

            return (
              <li key={item.path} className="flex-1">
                <Link
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 space-y-1 transition-colors",
                    isActive ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive && "fill-indigo-400/20")} />
                  <span className="text-[10px] font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
