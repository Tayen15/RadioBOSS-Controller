import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-borderLine bg-slateDeck/50 py-5 px-4 font-mono text-xs text-zinc-500">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
          <span className="font-semibold text-zinc-300">Radio Caster Hub</span>
          <span className="text-zinc-700">•</span>
          <span className="text-zinc-400">Pusat Analitik & Jaringan Siaran Radio</span>
          <span className="text-zinc-700">•</span>
          <span className="text-zinc-500">Zero-PII Telemetry</span>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span>&copy; {new Date().getFullYear()}</span>
          <span className="text-zinc-700">•</span>
          <a
            href="https://hi.oktaa.my.id"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amberSignal hover:text-amberHover transition font-semibold"
          >
            oktaa
          </a>
        </div>
      </div>
    </footer>
  );
}
