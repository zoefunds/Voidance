"use client";

import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const LINKS = [
  { href: "/how-it-works", label: "How it Works" },
  { href: "/policies", label: "Browse Policies" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
];

export function NavBar() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between w-full px-6 md:px-10 py-3 bg-surface-container-lowest/80 backdrop-blur-md border-b border-outline-variant">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.svg" alt="Voidance logo" width={26} height={26} />
        <span className="font-display text-headline-xs text-trust-blue">Voidance</span>
      </Link>
      <div className="hidden md:flex items-center gap-6">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-body-sm text-on-surface-variant hover:text-research-teal transition-colors"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
      />
    </nav>
  );
}
