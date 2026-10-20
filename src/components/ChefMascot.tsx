import { useEffect, useState } from "react";

type Stage = "placed" | "preparing" | "ready" | "served" | "thankyou";

const MESSAGES: Record<Stage, string> = {
  placed: "Got your order!",
  preparing: "Cooking up something great!",
  ready: "Your food is ready!",
  served: "Enjoy your meal!",
  thankyou: "Thank you for dining with us!",
};

export function ChefMascot({ stage }: { stage: Stage }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div
      className="flex flex-col items-center gap-2 py-5 select-none"
      style={{ opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease" }}
    >
      <style>{`
        @keyframes mascot-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes mascot-wave {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-12deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-8deg); }
          80% { transform: rotate(4deg); }
        }
        @keyframes mascot-steam {
          0% { opacity: 0; transform: translateY(0) scale(0.5); }
          50% { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(-20px) scale(1.3); }
        }
        @keyframes mascot-bell {
          0%, 60%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-6deg); }
          50% { transform: rotate(3deg); }
        }
        @keyframes mascot-bell-wave {
          0%, 30% { opacity: 0; transform: scale(0.4); }
          60% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.6); }
        }
        @keyframes mascot-heart {
          0% { opacity: 0; transform: translateY(0) scale(0.2); }
          35% { opacity: 1; transform: translateY(-12px) scale(1); }
          100% { opacity: 0; transform: translateY(-30px) scale(0.4); }
        }
        @keyframes mascot-star {
          0% { opacity: 0; transform: rotate(0deg) scale(0.2); }
          50% { opacity: 1; transform: rotate(180deg) scale(1); }
          100% { opacity: 0; transform: rotate(360deg) scale(0.2); }
        }
        @keyframes mascot-sparkle {
          0%, 100% { opacity: 0; transform: scale(0.4); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes mascot-pan-shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-4deg); }
          75% { transform: rotate(4deg); }
        }
        @keyframes mascot-tray-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes mascot-shine {
          0%, 100% { opacity: 0.1; }
          50% { opacity: 0.8; }
        }
        @keyframes mascot-ticket-wave {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(5deg); }
        }
        @keyframes mascot-confetti {
          0% { opacity: 0; transform: translateY(-10px) rotate(0deg); }
          20% { opacity: 1; }
          100% { opacity: 0; transform: translateY(45px) rotate(360deg); }
        }
        @keyframes mascot-bubble-pop {
          0% { opacity: 0; transform: scale(0.3) translateY(8px); }
          30% { opacity: 1; transform: scale(1.05) translateY(0); }
          40% { transform: scale(1) translateY(0); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes mascot-stamp {
          0% { opacity: 0; transform: scale(2.5) rotate(-20deg); }
          40% { opacity: 1; transform: scale(1) rotate(-12deg); }
          50% { transform: scale(0.95) rotate(-12deg); }
          60% { transform: scale(1) rotate(-12deg); }
          100% { opacity: 1; transform: scale(1) rotate(-12deg); }
        }
        @keyframes mascot-bye-wave {
          0%, 100% { transform: rotate(0deg) scaleX(-1); }
          15% { transform: rotate(-10deg) scaleX(-1); }
          30% { transform: rotate(8deg) scaleX(-1); }
          45% { transform: rotate(-6deg) scaleX(-1); }
          60% { transform: rotate(4deg) scaleX(-1); }
        }
      `}</style>

      {/* Speech bubble — above the chef, tail pointing down to mouth */}
      <div
        style={{ animation: "mascot-bubble-pop 0.6s ease-out forwards", maxWidth: 200 }}
      >
        <div
          className="rounded-[18px] bg-white px-4 py-2.5 text-center shadow-sm"
          style={{ border: "2px solid #0B1B3F" }}
        >
          <p className="text-[13px] font-bold tracking-tight leading-snug" style={{ color: "#0B1B3F" }}>
            {MESSAGES[stage]}
          </p>
          {stage === "thankyou" && (
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
              We hope you had a great experience!
            </p>
          )}
        </div>
        {/* Tail pointing down to chef */}
        <div className="flex justify-center">
          <svg viewBox="0 0 16 10" width="16" height="10" className="block -mt-[1px]">
            <path d="M0 0 L8 10 L16 0 Z" fill="white" />
            <path d="M0 0 L8 10" stroke="#0B1B3F" strokeWidth="2" fill="none" />
            <path d="M8 10 L16 0" stroke="#0B1B3F" strokeWidth="2" fill="none" />
          </svg>
        </div>
      </div>

      {/* Chef image — centered */}
      <div className="relative" style={{ width: 130, height: 140, marginTop: -2 }}>
        {/* Chef image — multiply blends white into the page background.
            Each stage gets a distinct CSS transform so the same image
            reads as a different gesture/pose. */}
        <img
          src="/chef-served.png"
          alt="Chef mascot"
          className="w-full h-full object-contain"
          style={{
            mixBlendMode: "multiply",
            ...(stage === "placed" ? {
              transform: "scaleX(-1)",
              animation: "mascot-wave 1.4s ease-in-out infinite",
            } : stage === "preparing" ? {
              animation: "mascot-pan-shake 0.6s ease-in-out infinite",
            } : stage === "ready" ? {
              animation: "mascot-bounce 2s ease-in-out infinite",
            } : stage === "thankyou" ? {
              transform: "scaleX(-1)",
              animation: "mascot-bye-wave 2s ease-in-out infinite",
            } : {
              animation: "mascot-bounce 2.5s ease-in-out infinite",
            }),
          }}
        />

        {/* Status-specific overlays */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 150 160"
          fill="none"
        >
          {stage === "placed" && (
            <>
              {/* Large clipboard with checkmark — order confirmed */}
              <g style={{ animation: "mascot-ticket-wave 2s ease-in-out infinite", transformOrigin: "22px 60px" }}>
                {/* Clipboard body */}
                <rect x="2" y="30" width="38" height="50" rx="5" fill="white" stroke="#CBD5E1" strokeWidth="1.5" />
                {/* Clip at top */}
                <rect x="12" y="25" width="18" height="10" rx="3" fill="#0B7BFF" />
                <rect x="15" y="28" width="12" height="5" rx="2" fill="white" />
                {/* Text lines */}
                <line x1="9" y1="44" x2="33" y2="44" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="50" x2="28" y2="50" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="56" x2="31" y2="56" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
                {/* Checkmark */}
                <circle cx="22" cy="68" r="6" fill="#22C55E" opacity="0.15" />
                <path d="M17 68 L20 71 L27 64" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
              {/* Sparkles */}
              <circle cx="142" cy="35" r="3" fill="#0B7BFF" style={{ animation: "mascot-sparkle 2s ease-in-out infinite" }} />
              <circle cx="145" cy="80" r="2" fill="#22C55E" style={{ animation: "mascot-sparkle 2s ease-in-out 0.5s infinite" }} />
              <circle cx="5" cy="95" r="2" fill="#F59E0B" style={{ animation: "mascot-sparkle 2s ease-in-out 1s infinite" }} />
              {/* Small check badge top-right */}
              <g style={{ animation: "mascot-sparkle 2.5s ease-in-out 0.3s infinite" }}>
                <circle cx="138" cy="55" r="5" fill="#22C55E" opacity="0.2" />
                <path d="M135 55 L137 57.5 L141 52.5" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </>
          )}

          {stage === "preparing" && (
            <>
              {/* Frying pan */}
              <g style={{ animation: "mascot-pan-shake 0.6s ease-in-out infinite", transformOrigin: "25px 95px" }}>
                <ellipse cx="22" cy="90" rx="20" ry="8" fill="#64748B" stroke="#475569" strokeWidth="1.5" />
                <rect x="38" y="87" width="16" height="5" rx="2.5" fill="#475569" />
                {/* Food */}
                <circle cx="16" cy="88" r="3.5" fill="#F59E0B" />
                <circle cx="25" cy="87" r="3" fill="#EF4444" />
                <circle cx="12" cy="87" r="2.5" fill="#22C55E" />
              </g>
              {/* Steam rising */}
              <path d="M14 78 Q11 71 14 64" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" style={{ animation: "mascot-steam 1.8s ease-out infinite" }} />
              <path d="M22 76 Q25 69 22 62" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" style={{ animation: "mascot-steam 1.8s ease-out 0.5s infinite" }} />
              <path d="M30 78 Q27 71 30 64" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" style={{ animation: "mascot-steam 1.8s ease-out 1s infinite" }} />
              {/* Sparkle */}
              <circle cx="142" cy="50" r="2.5" fill="#F59E0B" style={{ animation: "mascot-sparkle 2s ease-in-out infinite" }} />
            </>
          )}

          {stage === "ready" && (
            <>
              {/* Bell */}
              <g style={{ animation: "mascot-bell 2s ease-in-out infinite", transformOrigin: "22px 55px" }}>
                <path d="M10 65 Q10 46 22 46 Q34 46 34 65Z" fill="#F59E0B" stroke="#D97706" strokeWidth="1.5" />
                <rect x="17" y="40" width="10" height="6" rx="3" fill="#D97706" />
                <circle cx="22" cy="67" r="3" fill="#D97706" />
              </g>
              {/* Sound waves */}
              <path d="M4 50 Q-1 55 4 60" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" style={{ animation: "mascot-bell-wave 2s ease-out infinite" }} />
              <path d="M40 50 Q45 55 40 60" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" style={{ animation: "mascot-bell-wave 2s ease-out 0.3s infinite" }} />
              {/* Serving tray on other side */}
              <g style={{ animation: "mascot-tray-float 2s ease-in-out infinite" }}>
                <rect x="112" y="55" width="34" height="4" rx="2" fill="#94A3B8" stroke="#64748B" strokeWidth="1" />
                <path d="M116 55 Q129 35 142 55" fill="#C0C0C0" stroke="#A0A0A0" strokeWidth="1.5" />
                <circle cx="129" cy="39" r="3" fill="#94A3B8" stroke="#64748B" strokeWidth="1" />
                <path d="M122 48 Q127 41 134 46" stroke="white" strokeWidth="1.5" strokeLinecap="round" style={{ animation: "mascot-shine 2s ease-in-out infinite" }} />
              </g>
            </>
          )}

          {stage === "served" && (
            <>
              {/* Floating hearts */}
              <g style={{ animation: "mascot-heart 2.4s ease-out infinite" }}>
                <path d="M20 45 C20 41 26 41 26 45 C26 49 20 53 20 53 C20 53 14 49 14 45 C14 41 20 41 20 45Z" fill="#FF6B8A" />
              </g>
              <g style={{ animation: "mascot-heart 2.4s ease-out 0.8s infinite" }}>
                <path d="M135 30 C135 27 140 27 140 30 C140 33 135 36 135 36 C135 36 130 33 130 30 C130 27 135 27 135 30Z" fill="#FF6B8A" />
              </g>
              <g style={{ animation: "mascot-heart 2.4s ease-out 1.6s infinite" }}>
                <path d="M45 20 C45 18 48 18 48 20 C48 22 45 24 45 24 C45 24 42 22 42 20 C42 18 45 18 45 20Z" fill="#FF6B8A" />
              </g>
              {/* Stars */}
              <g style={{ animation: "mascot-star 3s ease-in-out infinite" }}>
                <path d="M145 65 L147 59 L149 65 L155 67 L149 69 L147 75 L145 69 L139 67Z" fill="#F59E0B" />
              </g>
              <g style={{ animation: "mascot-star 3s ease-in-out 1s infinite" }}>
                <path d="M8 75 L10 70 L12 75 L17 76 L12 78 L10 83 L8 78 L3 76Z" fill="#F59E0B" />
              </g>
              <g style={{ animation: "mascot-star 3s ease-in-out 2s infinite" }}>
                <path d="M110 18 L111 15 L112 18 L115 19 L112 20 L111 23 L110 20 L107 19Z" fill="#0B7BFF" />
              </g>
              {/* Sparkle dots */}
              <circle cx="5" cy="50" r="2.5" fill="#0B7BFF" style={{ animation: "mascot-sparkle 1.8s ease-in-out infinite" }} />
              <circle cx="148" cy="95" r="2" fill="#0B7BFF" style={{ animation: "mascot-sparkle 1.8s ease-in-out 0.6s infinite" }} />
              <circle cx="25" cy="130" r="1.5" fill="#F59E0B" style={{ animation: "mascot-sparkle 1.8s ease-in-out 1.2s infinite" }} />
            </>
          )}

          {stage === "thankyou" && (
            <>
              {/* PAID stamp badge */}
              <g style={{ animation: "mascot-stamp 1s ease-out 0.4s both", transformOrigin: "24px 50px" }}>
                <rect x="4" y="35" width="40" height="22" rx="4" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeDasharray="3 2" />
                <text x="24" y="51" textAnchor="middle" fontSize="13" fontWeight="800" fill="#22C55E" letterSpacing="1.5">PAID</text>
              </g>

              {/* Confetti rain */}
              <rect x="25" y="2" width="4" height="7" rx="1" fill="#0B7BFF" style={{ animation: "mascot-confetti 2.8s ease-out infinite" }} />
              <rect x="55" y="0" width="4" height="7" rx="1" fill="#F59E0B" style={{ animation: "mascot-confetti 2.8s ease-out 0.35s infinite" }} />
              <rect x="85" y="3" width="4" height="7" rx="1" fill="#22C55E" style={{ animation: "mascot-confetti 2.8s ease-out 0.7s infinite" }} />
              <rect x="40" y="1" width="4" height="7" rx="1" fill="#FF6B8A" style={{ animation: "mascot-confetti 2.8s ease-out 1.05s infinite" }} />
              <rect x="70" y="4" width="4" height="7" rx="1" fill="#0B7BFF" style={{ animation: "mascot-confetti 2.8s ease-out 1.4s infinite" }} />
              <rect x="115" y="2" width="4" height="7" rx="1" fill="#F59E0B" style={{ animation: "mascot-confetti 2.8s ease-out 1.75s infinite" }} />
              <circle cx="35" cy="3" r="2.5" fill="#22C55E" style={{ animation: "mascot-confetti 2.8s ease-out 0.5s infinite" }} />
              <circle cx="95" cy="1" r="2.5" fill="#FF6B8A" style={{ animation: "mascot-confetti 2.8s ease-out 1.2s infinite" }} />
              <circle cx="130" cy="5" r="2" fill="#0B7BFF" style={{ animation: "mascot-confetti 2.8s ease-out 2s infinite" }} />

              {/* Stars */}
              <g style={{ animation: "mascot-star 3s ease-in-out infinite" }}>
                <path d="M145 65 L147 59 L149 65 L155 67 L149 69 L147 75 L145 69 L139 67Z" fill="#F59E0B" />
              </g>
              <g style={{ animation: "mascot-star 3s ease-in-out 1.5s infinite" }}>
                <path d="M3 90 L5 85 L7 90 L12 91 L7 93 L5 98 L3 93 L-2 91Z" fill="#F59E0B" />
              </g>

              {/* Floating hearts */}
              <g style={{ animation: "mascot-heart 2.8s ease-out infinite" }}>
                <path d="M140 40 C140 37 144 37 144 40 C144 43 140 46 140 46 C140 46 136 43 136 40 C136 37 140 37 140 40Z" fill="#FF6B8A" />
              </g>
              <g style={{ animation: "mascot-heart 2.8s ease-out 1.2s infinite" }}>
                <path d="M8 70 C8 68 11 68 11 70 C11 72 8 74 8 74 C8 74 5 72 5 70 C5 68 8 68 8 70Z" fill="#FF6B8A" />
              </g>
            </>
          )}
        </svg>
        </div>
    </div>
  );
}
