import { useState, useEffect } from "react";
import { X, ChevronRight, ChevronLeft, ArrowUpRight, ArrowDownLeft, QrCode } from "lucide-react";

const steps = [
  {
    title: "Welcome to SimuWallet",
    description: "Your digital wallet on the testnet. Let's take a quick tour of the core features.",
    icon: null
  },
  {
    title: "Checking Your Balance",
    description: "Your total balance is displayed right on the home screen. Since this is a testnet, you start with 1,000 GOLD for free!",
    icon: <div className="text-4xl font-semibold tracking-tighter text-white">1,000<span className="text-sm ml-1 text-zinc-500">GOLD</span></div>
  },
  {
    title: "Sending Funds",
    description: "Tap the 'Send' button to transfer GOLD. You'll need the recipient's wallet address. You can also send transactions offline, and they will sync when you reconnect.",
    icon: <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-indigo-400"><ArrowUpRight size={32} /></div>
  },
  {
    title: "Receiving Funds",
    description: "Tap 'Receive' to see your wallet address and a QR code. Share this with others so they can send you GOLD.",
    icon: <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-indigo-400"><ArrowDownLeft size={32} /></div>
  },
  {
    title: "Scan to Pay",
    description: "Use the 'Scan' button to quickly scan someone's QR code using your device's camera. It automatically fills in their address.",
    icon: <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-indigo-400"><QrCode size={32} /></div>
  }
];

export default function Tutorial() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Show tutorial on first visit
    const hasSeenTutorial = localStorage.getItem("simu_wallet_tutorial_seen");
    if (!hasSeenTutorial) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("simu_wallet_tutorial_seen", "true");
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  if (!isOpen) return null;

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden flex flex-col relative animate-in fade-in zoom-in-95 duration-200">
        <button 
          onClick={handleClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-8 flex flex-col items-center justify-center text-center min-h-[280px]">
          <div className="mb-6 h-20 flex items-center justify-center">
            {step.icon || <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">S</div>}
          </div>
          <h2 className="text-xl font-semibold text-white mb-3">{step.title}</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            {step.description}
          </p>
        </div>

        <div className="p-6 bg-zinc-950/50 flex flex-col items-center space-y-4">
          <div className="flex space-x-1.5">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`w-2 h-2 rounded-full transition-colors ${i === currentStep ? 'bg-indigo-500' : 'bg-zinc-800'}`}
              />
            ))}
          </div>
          
          <div className="flex items-center justify-between w-full pt-2">
            <button 
              onClick={prevStep}
              disabled={currentStep === 0}
              className={`p-2 rounded-full ${currentStep === 0 ? 'text-zinc-700' : 'text-zinc-400 hover:text-white'}`}
            >
              <ChevronLeft size={24} />
            </button>
            <button 
              onClick={nextStep}
              className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2.5 px-6 rounded-xl transition-colors flex items-center space-x-2"
            >
              <span>{currentStep === steps.length - 1 ? "Get Started" : "Next"}</span>
              {currentStep < steps.length - 1 && <ChevronRight size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
