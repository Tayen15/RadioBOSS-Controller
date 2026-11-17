import Link from "next/link";

interface NavbarProps {
  activeStationsOnline?: number;
  currentPath?: "/" | "/stations" | "/analytics";
}

export function Navbar({ activeStationsOnline = 0, currentPath = "/" }: NavbarProps) {
  const navLinks = [
    { href: "/", label: "Global Charts", id: "/" },
    { href: "/stations", label: "Direktori Stasiun", id: "/stations" },
    { href: "/analytics", label: "Analitik Jaringan", id: "/analytics" },
  ];

  return (
    <header className="border-b border-borderLine bg-slateDeck/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="font-extrabold text-sm tracking-wider text-white">
              RADIO CASTER HUB
            </span>
            <span className="bg-amberSignal/15 text-amberSignal border border-amberSignal/30 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
              CLOUD
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 text-xs">
            {navLinks.map((link) => {
              const isActive = currentPath === link.id;
              return (
                <Link
                  key={link.id}
                  href={link.href}
                  className={`px-3 py-1.5 rounded transition font-medium ${
                    isActive
                      ? "bg-amberSignal text-carbon font-bold"
                      : "text-zinc-400 hover:text-white hover:bg-surfaceControl"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div
            className={`flex items-center gap-2 px-2.5 py-1 rounded border transition ${
              activeStationsOnline > 0
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-zinc-400 bg-zinc-900/80 border-borderLine"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                activeStationsOnline > 0 ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <span>
              {activeStationsOnline > 0
                ? `${activeStationsOnline} Stasiun Online`
                : "0 Stasiun Online (Standby)"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
