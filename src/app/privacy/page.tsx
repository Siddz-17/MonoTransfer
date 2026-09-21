import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8 md:p-16 max-w-4xl mx-auto font-mono selection:bg-foreground selection:text-background">
      <div className="mb-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-xs text-secondary hover:text-foreground tracking-widest uppercase transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>RETURN TO HOME</span>
        </Link>
      </div>

      <article className="space-y-10">
        <header className="border-b border-border pb-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-foreground" />
            <span className="text-xs uppercase tracking-widest text-secondary">
              LEGAL DOCUMENTATION // SPEC 1.0
            </span>
          </div>
          <h1 className="font-dot text-4xl sm:text-5xl font-bold uppercase tracking-wider">
            PRIVACY POLICY
          </h1>
          <p className="text-xs text-secondary uppercase tracking-widest">
            LAST UPDATED: SEPTEMBER 2026
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-dot text-lg font-bold uppercase tracking-wider text-foreground">
            1. OVERVIEW & SCOPE
          </h2>
          <p className="text-xs text-secondary leading-relaxed">
            MonoTransfer is a utility designed strictly to migrate user-selected playlists between Spotify and YouTube Music. We believe in absolute data minimization: we do not sell, rent, monetize, or track your personal information or listening habits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-dot text-lg font-bold uppercase tracking-wider text-foreground">
            2. DATA WE ACCESS VIA OAUTH
          </h2>
          <p className="text-xs text-secondary leading-relaxed">
            When you authenticate with Spotify and Google, we access only the minimal scopes required to perform migrations:
          </p>
          <ul className="list-disc list-inside text-xs text-secondary space-y-1.5 leading-relaxed">
            <li><strong>Spotify:</strong> Read access to your playlists and track metadata to build migration manifests.</li>
            <li><strong>Google / YouTube:</strong> Write access to create playlists and insert tracks into your YouTube Music library.</li>
            <li><strong>User Profile:</strong> Your email and display name strictly to identify your migration session.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-dot text-lg font-bold uppercase tracking-wider text-foreground">
            3. TOKEN SECURITY & ENCRYPTION AT REST
          </h2>
          <p className="text-xs text-secondary leading-relaxed">
            All OAuth tokens (Spotify and Google access and refresh tokens) are encrypted at rest using military-grade <strong>AES-256-GCM</strong> cryptography with unique 12-byte initialization vectors and 16-byte authentication tags. Plaintext credentials are never persisted to disk or logs.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-dot text-lg font-bold uppercase tracking-wider text-foreground">
            4. DATA RETENTION & REVOCATION
          </h2>
          <p className="text-xs text-secondary leading-relaxed">
            You maintain full sovereignty over your data. You can disconnect linked providers or purge your account and all associated tokens at any time via the Settings screen. Revoking access from your Spotify or Google account dashboard immediately invalidates all stored tokens.
          </p>
        </section>

        <footer className="border-t border-border pt-8 text-[11px] text-secondary tracking-widest uppercase">
          MONOTRANSFER // MONOCHROMATIC UTILITY
        </footer>
      </article>
    </main>
  );
}
