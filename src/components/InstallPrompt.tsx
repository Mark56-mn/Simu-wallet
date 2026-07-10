import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // Optionally check if already installed
    window.addEventListener("appinstalled", () => {
      setDeferredPrompt(null);
      setShowPrompt(false);
      console.log("PWA was installed");
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 z-50 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl flex flex-col gap-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
                S
              </div>
              <div>
                <h3 className="text-white font-medium">Install SIMU Wallet</h3>
                <p className="text-zinc-400 text-sm">Add to home screen for quick access</p>
              </div>
            </div>
            <button 
              onClick={() => setShowPrompt(false)}
              className="text-zinc-400 hover:text-white p-1 bg-zinc-800 rounded-full"
            >
              <X size={16} />
            </button>
          </div>
          
          <button
            onClick={handleInstallClick}
            className="w-full bg-white text-black py-2.5 rounded-xl font-medium flex justify-center items-center gap-2 hover:bg-zinc-200 active:bg-zinc-300 transition-colors"
          >
            <Download size={18} />
            Install App
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
