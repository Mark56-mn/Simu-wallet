import { useState, useEffect } from "react";
import { Lock, Delete } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface PinGuardProps {
  children: React.ReactNode;
}

export default function PinGuard({ children }: PinGuardProps) {
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "setup" | "confirm">("enter");

  useEffect(() => {
    const storedPin = localStorage.getItem("simu_wallet_pin");
    if (storedPin) {
      setSavedPin(storedPin);
      setStep("enter");
    } else {
      setStep("setup");
      setSetupMode(true);
    }
  }, []);

  const handlePress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);

      if (newPin.length === 4) {
        setTimeout(() => processPin(newPin), 100);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
  };

  const processPin = (currentPin: string) => {
    if (step === "enter") {
      if (currentPin === savedPin) {
        setIsUnlocked(true);
      } else {
        setError(true);
        setTimeout(() => setPin(""), 400);
      }
    } else if (step === "setup") {
      setConfirmPin(currentPin);
      setPin("");
      setStep("confirm");
    } else if (step === "confirm") {
      if (currentPin === confirmPin) {
        localStorage.setItem("simu_wallet_pin", currentPin);
        setSavedPin(currentPin);
        setIsUnlocked(true);
      } else {
        setError(true);
        setTimeout(() => {
          setPin("");
          setConfirmPin("");
          setStep("setup");
        }, 800);
      }
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  const getTitle = () => {
    if (step === "setup") return "Create PIN";
    if (step === "confirm") return "Confirm PIN";
    return "Enter PIN";
  };

  const getSubtitle = () => {
    if (error) {
      return step === "confirm" ? "PINs do not match" : "Incorrect PIN";
    }
    return step === "setup" ? "Secure your wallet" : "Unlock your wallet";
  };

  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-zinc-950 text-zinc-50 p-6 items-center justify-center">
      <div className="flex flex-col items-center mb-12">
        <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mb-6 text-indigo-400">
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-semibold mb-2">{getTitle()}</h1>
        <p className={cn("text-sm", error ? "text-red-400" : "text-zinc-400")}>
          {getSubtitle()}
        </p>
      </div>

      <motion.div 
        className="flex space-x-4 mb-16"
        animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full transition-colors duration-200",
              i < pin.length ? "bg-indigo-500" : "bg-zinc-800"
            )}
          />
        ))}
      </motion.div>

      <div className="grid grid-cols-3 gap-6 w-full max-w-[280px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handlePress(num.toString())}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-medium bg-zinc-900 active:bg-zinc-800 transition-colors mx-auto"
          >
            {num}
          </button>
        ))}
        <div />
        <button
          onClick={() => handlePress("0")}
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-medium bg-zinc-900 active:bg-zinc-800 transition-colors mx-auto"
        >
          0
        </button>
        <button
          onClick={handleDelete}
          disabled={pin.length === 0}
          className="w-16 h-16 rounded-full flex items-center justify-center text-zinc-400 active:bg-zinc-800 transition-colors mx-auto disabled:opacity-50"
        >
          <Delete size={24} />
        </button>
      </div>
    </div>
  );
}
