import Link from "next/link";

export function Footer() {
  const commitSha = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || "4dd35bb";
  const commitUrl = `https://github.com/Tayen15/RadioBOSS-Controller/commit/${commitSha}`;

  return (
    <footer className="border-t border-borderLine bg-slateDeck/50 py-4 px-4 font-mono text-xs text-zinc-500">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
          <span className="font-semibold text-zinc-300">Radio Caster Hub</span>
          <span className="text-zinc-600">•</span>
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-amberSignal transition underline decoration-zinc-700 underline-offset-2"
            title="Lihat commit di GitHub"
          >
            v{commitSha}
          </a>
        </div>

        <div className="flex items-center gap-2 text-zinc-400">
          <span>Credits</span>
          <span className="text-zinc-600">•</span>
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
