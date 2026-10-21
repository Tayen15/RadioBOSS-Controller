"use client";

import React, { useState, useEffect } from "react";
import {
  Volume2,
  Square,
  Sparkles,
  Radio,
  Zap,
  Flame,
  Laugh,
  Megaphone,
  RadioTower,
  BellRing,
  Headphones,
} from "lucide-react";
import { CartItem } from "@/lib/types";
import { triggerRadioBossCart, stopAllRadioBossCarts } from "@/lib/api";

const DEFAULT_CARTS: CartItem[] = [
  {
    id: 1,
    label: "Station ID",
    sublabel: "Jingle Utama Siaran",
    category: "jingle",
    color: "primary",
    shortcut: "1",
  },
  {
    id: 2,
    label: "Radio Sweeper",
    sublabel: "Drop Suara Cepat",
    category: "sweeper",
    color: "secondary",
    shortcut: "2",
  },
  {
    id: 3,
    label: "Applause Crowd",
    sublabel: "Sorak & Tepuk Tangan",
    category: "sfx",
    color: "accent",
    shortcut: "3",
  },
  {
    id: 4,
    label: "DJ Air Horn",
    sublabel: "Stinger Klakson Hype",
    category: "sfx",
    color: "warning",
    shortcut: "4",
  },
  {
    id: 5,
    label: "Opening Bumper",
    sublabel: "Intro Masuk Program",
    category: "jingle",
    color: "primary",
    shortcut: "5",
  },
  {
    id: 6,
    label: "News / Talk Bed",
    sublabel: "Musik Latar Berita",
    category: "bed",
    color: "info",
    shortcut: "6",
  },
  {
    id: 7,
    label: "Voice Stinger",
    sublabel: "Transisi Obrolan",
    category: "sweeper",
    color: "secondary",
    shortcut: "7",
  },
  {
    id: 8,
    label: "Vinyl Scratch",
    sublabel: "Efek Rem / Ganti Topik",
    category: "sfx",
    color: "accent",
    shortcut: "8",
  },
];

interface SoundboardWidgetProps {
  connected: boolean;
  onNotify?: (type: "success" | "error", message: string) => void;
}

export function SoundboardWidget({
  connected,
  onNotify,
}: SoundboardWidgetProps) {
  const [activeCartId, setActiveCartId] = useState<number | null>(null);
  const [mode, setMode] = useState<"radioboss" | "local">("radioboss");
  const [isStopping, setIsStopping] = useState<boolean>(false);

  // Web Audio Context synthesizer for instant local soundboard preview
  const playLocalSynthEffect = (id: number) => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (id === 1) {
        // Station ID - Uplifting major arpeggio
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.12);
        osc.frequency.setValueAtTime(659.25, now + 0.24);
        osc.frequency.setValueAtTime(880, now + 0.36);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.start(now);
        osc.stop(now + 0.9);
      } else if (id === 2) {
        // Sweeper - Whoosh drop
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (id === 4) {
        // Air Horn - Brass dual pulse
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(370, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.01, now + 0.15);
        gain.gain.setValueAtTime(0.35, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
        // Crisp chime/drop for other carts
        osc.type = "triangle";
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // AudioContext not supported
    }
  };

  const handleTriggerCart = async (cart: CartItem) => {
    setActiveCartId(cart.id);

    // Auto reset visual trigger animation after 1.4s
    setTimeout(() => {
      setActiveCartId((curr) => (curr === cart.id ? null : curr));
    }, 1400);

    if (mode === "local") {
      playLocalSynthEffect(cart.id);
      return;
    }

    // RadioBOSS remote mode
    try {
      await triggerRadioBossCart(cart.id);
      onNotify?.("success", `Cart #${cart.id} (${cart.label}) dipicu di RadioBOSS!`);
    } catch (err) {
      // Fallback: also play local sound so operator is not left in silence
      playLocalSynthEffect(cart.id);
      const msg = err instanceof Error ? err.message : "Gagal memicu Cart di RadioBOSS.";
      onNotify?.("error", msg);
    }
  };

  const handleStopAll = async () => {
    setIsStopping(true);
    setActiveCartId(null);
    try {
      if (mode === "radioboss") {
        await stopAllRadioBossCarts();
        onNotify?.("success", "Semua jingle cart dihentikan.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghentikan cart.";
      onNotify?.("error", msg);
    } finally {
      setIsStopping(false);
    }
  };

  // Keyboard shortcut listener (Keys 1..8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing when typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 8) {
        const found = DEFAULT_CARTS.find((c) => c.id === num);
        if (found) {
          handleTriggerCart(found);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, connected]);

  const getCartIcon = (id: number) => {
    switch (id) {
      case 1:
        return <BellRing className="h-4 w-4" />;
      case 2:
        return <Zap className="h-4 w-4" />;
      case 3:
        return <Laugh className="h-4 w-4" />;
      case 4:
        return <Flame className="h-4 w-4" />;
      case 5:
        return <RadioTower className="h-4 w-4" />;
      case 6:
        return <Radio className="h-4 w-4" />;
      case 7:
        return <Megaphone className="h-4 w-4" />;
      default:
        return <Sparkles className="h-4 w-4" />;
    }
  };

  return (
    <div className="card bg-base-200 border border-base-300 shadow-md">
      <div className="card-body p-4 sm:p-5 space-y-4">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Volume2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-base-content tracking-tight">
                  Instant Soundboard Carts
                </h3>
                <span className="badge badge-primary badge-xs font-semibold">
                  8 Pads
                </span>
              </div>
              <p className="text-[10px] text-base-content/50">
                Putar jingle, sweeper, dan SFX radio langsung dengan 1 klik atau tombol keyboard (1-8).
              </p>
            </div>
          </div>

          {/* Mode Switch & Stop Button */}
          <div className="flex items-center gap-2">
            <div className="join bg-base-300/60 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setMode("radioboss")}
                className={`join-item btn btn-xs text-[10px] border-none font-semibold ${
                  mode === "radioboss"
                    ? "btn-primary shadow-sm"
                    : "btn-ghost text-base-content/60"
                }`}
                title="Picu Cart Wall di aplikasi RadioBOSS"
              >
                <Radio className="h-2.5 w-2.5 mr-1" />
                <span>RadioBOSS Carts</span>
              </button>
              <button
                type="button"
                onClick={() => setMode("local")}
                className={`join-item btn btn-xs text-[10px] border-none font-semibold ${
                  mode === "local"
                    ? "btn-secondary shadow-sm"
                    : "btn-ghost text-base-content/60"
                }`}
                title="Pratinjau efek instan di headphone/speaker penyiar"
              >
                <Headphones className="h-2.5 w-2.5 mr-1" />
                <span>Headphone Synth</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleStopAll}
              disabled={isStopping}
              className="btn btn-error btn-outline btn-xs gap-1 font-bold"
              title="Hentikan semua cart yang sedang bersuara"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop All</span>
            </button>
          </div>
        </div>

        {/* Carts Pad Grid (8 Carts) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {DEFAULT_CARTS.map((cart) => {
            const isActive = activeCartId === cart.id;
            return (
              <button
                key={cart.id}
                type="button"
                onClick={() => handleTriggerCart(cart)}
                className={`group relative flex flex-col justify-between p-3 rounded-2xl border text-left transition-all duration-150 active:scale-95 ${
                  isActive
                    ? "bg-primary/20 border-primary shadow-lg shadow-primary/20 scale-[0.98]"
                    : "bg-base-100 hover:bg-base-300/60 border-base-300 hover:border-primary/40 shadow-sm"
                }`}
              >
                {/* Top Badge: Slot Index & Shortcut */}
                <div className="flex items-center justify-between w-full mb-2">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${
                      isActive
                        ? "bg-primary text-primary-content"
                        : "bg-base-200 text-base-content/70"
                    }`}
                  >
                    {getCartIcon(cart.id)}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="badge badge-ghost badge-xs font-mono font-bold text-[9px] px-1.5 opacity-60">
                      Key {cart.shortcut}
                    </span>
                  </div>
                </div>

                {/* Cart Labels */}
                <div className="min-w-0 w-full space-y-0.5">
                  <h4
                    className={`text-xs font-bold truncate transition-colors ${
                      isActive ? "text-primary" : "text-base-content group-hover:text-primary"
                    }`}
                  >
                    {cart.label}
                  </h4>
                  <p className="text-[10px] text-base-content/50 truncate">
                    {cart.sublabel}
                  </p>
                </div>

                {/* Animated Visualizer Bar when playing */}
                {isActive && (
                  <div className="flex items-center gap-0.5 mt-2 h-1.5 w-full">
                    <span className="bg-primary h-full w-1/4 rounded-full animate-pulse" />
                    <span className="bg-accent h-full w-1/3 rounded-full animate-bounce" />
                    <span className="bg-secondary h-full w-1/4 rounded-full animate-pulse" />
                    <span className="bg-primary h-full w-1/4 rounded-full animate-bounce" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
