/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WalletProvider, useWallet } from "./lib/WalletContext";
import PinGuard from "./components/PinGuard";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Send from "./pages/Send";
import Receive from "./pages/Receive";
import History from "./pages/History";
import Scan from "./pages/Scan";
import Settings from "./pages/Settings";
import { InstallPrompt } from "./components/InstallPrompt";
import { OfflineIndicator } from "./components/OfflineIndicator";

function AppGuard({ children }: { children: React.ReactNode }) {
  const { loading } = useWallet();
  
  if (loading) return <div className="flex items-center justify-center h-[100dvh] bg-zinc-950 text-zinc-500">Loading...</div>;
  
  return <PinGuard>{children}</PinGuard>;
}

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <InstallPrompt />
        <OfflineIndicator />
        <Routes>
          <Route path="/" element={<AppGuard><Layout /></AppGuard>}>
            <Route index element={<Home />} />
            <Route path="send" element={<Send />} />
            <Route path="receive" element={<Receive />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/scan" element={<AppGuard><Scan /></AppGuard>} />
        </Routes>
      </WalletProvider>
    </BrowserRouter>
  );
}
