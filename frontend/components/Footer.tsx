import Link from "next/link";
import Image from "next/image";

const COLS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/policies", label: "Browse Policies" },
      { href: "/submit-claim", label: "Submit a Claim" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { href: "/how-it-works", label: "How it Works" },
      { href: "/docs", label: "Documentation" },
      { href: "/whitepaper", label: "Whitepaper" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="w-full py-10 px-6 md:px-10 bg-trust-blue text-white mt-16">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-10">
        <div className="max-w-xs">
          <div className="flex items-center gap-2 mb-2">
            <Image src="/logo.svg" alt="Voidance logo" width={22} height={22} />
            <span className="font-display text-headline-xs">Voidance</span>
          </div>
          <p className="text-body-sm text-white/70">
            Decentralized insurance for rigorous research that fails honestly.
            Adjudicated by GenLayer validator consensus over real evidence.
          </p>
          <p className="text-label-xs text-white/50 mt-4">© 2026 Voidance. Secured by GenLayer.</p>
        </div>
        <div className="flex gap-16">
          {COLS.map((col) => (
            <div key={col.title}>
              <div className="text-label-xs uppercase tracking-wider text-research-teal mb-3">
                {col.title}
              </div>
              <div className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="text-body-sm text-white/70 hover:text-research-teal">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
