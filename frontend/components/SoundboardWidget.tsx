"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Volume2,
  Square,
  Radio,
  Zap,
  Flame,
  Laugh,
  Megaphone,
  RadioTower,
  BellRing,
  Headphones,
  Disc,
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

/**
 * 8-Pad Studio Cart Wall for triggering RadioBOSS cart slots or headphone synth cues.
 */
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
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (id === 1) {
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
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.4);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (id === 4) {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(370, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.setValueAtTime(0.01, now + 0.15);
        gain.gain.setValueAtTime(0.35, now + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
      } else {
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

  const handleTriggerCart = useCallback(
    async (cart: CartItem) => {
      setActiveCartId(cart.id);

      setTimeout(() => {
        setActiveCartId((curr) => (curr === cart.id ? null : curr));
      }, 1400);

      if (mode === "local") {
        playLocalSynthEffect(cart.id);
        return;
      }

      if (mode === "radioboss" && !connected) {
        playLocalSynthEffect(cart.id);
        onNotify?.(
          "error",
          "RadioBOSS terputus. Memutar efek di headphone lokal."
        );
        return;
      }

      try {
        await triggerRadioBossCart(cart.id);
        onNotify?.(
          "success",
          `Cart #${cart.id} (${cart.label}) dipicu di RadioBOSS!`
        );
      } catch (err) {
        playLocalSynthEffect(cart.id);
        const msg =
          err instanceof Error
            ? err.message
            : "Gagal memicu Cart di RadioBOSS.";
        onNotify?.("error", msg);
      }
    },
    [mode, connected, onNotify]
  );

  const handleStopAll = async () => {
    setIsStopping(true);
    setActiveCartId(null);
    try {
      if (mode === "radioboss") {
        await stopAllRadioBossCarts();
        onNotify?.("success", "Semua jingle cart dihentikan.");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menghentikan cart.";
      onNotify?.("error", msg);
    } finally {
      setIsStopping(false);
    }
  };

  // Keyboard shortcut listener (Keys 1..8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [handleTriggerCart]);

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
        return <Disc className="h-4 w-4" />;
    }
  };

  return (
    <div className="rounded-xl bg-base-200 border border-base-300 p-4 sm:p-5 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Volume2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-base-content">
              Instant Soundboard Carts
            </h3>
            <p className="text-xs text-base-content/70">
              Picu jingle, sweeper, dan SFX dengan klik atau tombol angka (1-8)
            </p>
          </div>
        </div>

        {/* Mode Switch & Stop Button */}
        <div className="flex items-center gap-2">
          <div className="grid grid-cols-2 gap-1 bg-base-100 p-1 rounded-lg border border-base-300">
            <button
              type="button"
              onClick={() => setMode("radioboss")}
              className={`btn btn-xs h-7 rounded-md border-none font-semibold text-xs gap-1.5 ${
                mode === "radioboss"
                  ? "bg-primary text-primary-content"
                  : "btn-ghost text-base-content/70"
              }`}
              title="Picu Cart Wall di aplikasi RadioBOSS"
            >
              <Radio className="h-3 w-3" />
              <span>RadioBOSS</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`btn btn-xs h-7 rounded-md border-none font-semibold text-xs gap-1.5 ${
                mode === "local"
                  ? "bg-secondary text-secondary-content"
                  : "btn-ghost text-base-content/70"
              }`}
              title="Pratinjau efek instan di headphone/speaker penyiar"
            >
              <Headphones className="h-3 w-3" />
              <span>Headphone</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleStopAll}
            disabled={isStopping}
            className="btn btn-error btn-outline btn-xs h-8 rounded-lg gap-1 font-bold text-xs"
            title="Hentikan semua cart yang sedang bersuara"
          >
            <Square className="h-3 w-3 fill-current" />
            <span>Stop</span>
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
              className={`group relative flex flex-col justify-between p-3 rounded-lg border text-left transition-colors duration-150 ${
                isActive
                  ? "bg-primary/15 border-primary"
                  : "bg-base-100 hover:bg-base-300/60 border-base-300 hover:border-primary/40"
              }`}
            >
              {/* Top Row: Icon & Shortcut */}
              <div className="flex items-center justify-between w-full mb-2">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-md ${
                    isActive
                      ? "bg-primary text-primary-content"
                      : "bg-base-200 text-base-content/70"
                  }`}
                >
                  {getCartIcon(cart.id)}
                </div>
                <span className="px-1.5 py-0.5 rounded bg-base-200 border border-base-300 font-mono font-bold text-xs text-base-content/70 tabular-nums">
                  {cart.shortcut}
                </span>
              </div>

              {/* Cart Labels */}
              <div className="min-w-0 w-full space-y-0.5">
                <h4
                  className={`text-xs font-bold truncate ${
                    isActive
                      ? "text-primary"
                      : "text-base-content group-hover:text-primary"
                  }`}
                >
                  {cart.label}
                </h4>
                <p className="text-xs text-base-content/60 truncate">
                  {cart.sublabel}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
