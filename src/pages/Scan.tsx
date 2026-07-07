import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";

export default function Scan() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-[100dvh] bg-black text-white relative">
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <button onClick={() => navigate(-1)} className="text-white bg-black/50 p-2 rounded-full backdrop-blur-md">
          <ArrowLeft size={24} />
        </button>
        <span className="font-medium">Scan QR Code</span>
        <button onClick={() => navigate("/")} className="text-white bg-black/50 p-2 rounded-full backdrop-blur-md">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden">
        <Scanner
          onScan={(result) => {
            if (result && result.length > 0) {
              navigate(`/send?to=${encodeURIComponent(result[0].rawValue)}`);
            }
          }}
          onError={(error) => {
            console.error(error instanceof Error ? error.message : String(error));
            setError("Could not start camera. Please check permissions.");
          }}
        />
        
        {/* Viewfinder overlay */}
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/40 flex items-center justify-center">
          <div className="w-64 h-64 border-2 border-indigo-500 rounded-3xl relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-3xl -ml-[2px] -mt-[2px]" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-3xl -mr-[2px] -mt-[2px]" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-3xl -ml-[2px] -mb-[2px]" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-3xl -mr-[2px] -mb-[2px]" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-24 left-0 w-full p-6 text-center z-10">
        {error ? (
          <p className="text-red-400 bg-black/80 p-3 rounded-xl backdrop-blur-md inline-block text-sm">{error}</p>
        ) : (
          <p className="text-zinc-300 bg-black/60 p-3 rounded-xl backdrop-blur-md inline-block text-sm">
            Align QR code within the frame to scan
          </p>
        )}
      </div>
    </div>
  );
}
