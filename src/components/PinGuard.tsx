import { useState, useEffect } from "react";
import { Lock, Delete, Fingerprint } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface PinGuardProps {
  children: React.ReactNode;
}

function base64urlToBuffer(base64url: string) {
  const padding = '='.repeat((4 - base64url.length % 4) % 4);
  const base64 = (base64url + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

export default function PinGuard({ children }: PinGuardProps) {
  const [pin, setPin] = useState("");
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "setup" | "confirm">("enter");
  
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricId, setBiometricId] = useState<string | null>(null);

  useEffect(() => {
    const storedPin = localStorage.getItem("simu_wallet_pin");
    if (storedPin) {
      setSavedPin(storedPin);
      setStep("enter");
    } else {
      setStep("setup");
      setSetupMode(true);
    }

    const storedBiometricId = localStorage.getItem("simu_wallet_biometric_id");
    if (storedBiometricId) {
      setBiometricId(storedBiometricId);
    }

    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then((available) => {
          if (available) setBiometricSupported(true);
        })
        .catch(() => {});
    }
  }, []);

  const handlePress = (num: string) => {
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      setError(false);
      setErrorMessage("");

      if (newPin.length === 4) {
        setTimeout(() => processPin(newPin), 100);
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(false);
    setErrorMessage("");
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

  const handleSetupBiometric = async () => {
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Simu Wallet" },
          user: {
            id: userId,
            name: "wallet_user",
            displayName: "Wallet User",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential;

      if (credential) {
        localStorage.setItem("simu_wallet_biometric_id", credential.id);
        setBiometricId(credential.id);
        setErrorMessage("");
      }
    } catch (e: any) {
      console.error("Biometric setup failed:", e);
      if (e.name === 'NotAllowedError') {
         setErrorMessage("Biometrics blocked in iframe. Please open in a new tab.");
      } else {
         setErrorMessage("Biometric setup failed or was canceled.");
      }
      setError(true);
    }
  };

  const handleBiometricLogin = async () => {
    if (!biometricId) return;
    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      const credentialIdArray = base64urlToBuffer(biometricId);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              id: credentialIdArray,
              type: "public-key",
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (assertion) {
        setIsUnlocked(true);
      }
    } catch (e: any) {
      console.error("Biometric login failed:", e);
      if (e.name === 'NotAllowedError') {
         setErrorMessage("Biometrics blocked in iframe. Please open in a new tab.");
      } else {
         setErrorMessage("Biometric login failed.");
      }
      setError(true);
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
      if (errorMessage) return errorMessage;
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
        <h1 className="text-2xl font-semibold mb-2 text-center">{getTitle()}</h1>
        <p className={cn("text-sm text-center max-w-[250px]", error ? "text-red-400" : "text-zinc-400")}>
          {getSubtitle()}
        </p>
      </div>

      <motion.div 
        className="flex space-x-4 mb-12"
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

      <div className="grid grid-cols-3 gap-6 w-full max-w-[280px] mb-8">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            onClick={() => handlePress(num.toString())}
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-medium bg-zinc-900 active:bg-zinc-800 transition-colors mx-auto"
          >
            {num}
          </button>
        ))}
        {biometricSupported && biometricId && step === "enter" ? (
          <button
            onClick={handleBiometricLogin}
            className="w-16 h-16 rounded-full flex items-center justify-center text-indigo-400 active:bg-zinc-800 transition-colors mx-auto"
          >
            <Fingerprint size={28} />
          </button>
        ) : (
          <div />
        )}
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
      
      {biometricSupported && !biometricId && step === "enter" && (
        <button 
          onClick={handleSetupBiometric}
          className="mt-4 text-sm text-indigo-400 font-medium flex items-center space-x-2 bg-indigo-500/10 px-4 py-2 rounded-full active:bg-indigo-500/20 transition-colors"
        >
          <Fingerprint size={16} />
          <span>Enable FaceID / Fingerprint</span>
        </button>
      )}
    </div>
  );
}
