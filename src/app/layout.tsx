import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MonoTransfer // Spotify → YouTube Music",
  description: "Minimalist, industrial playlist transfer tool migrating playlists from Spotify to YouTube Music.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-foreground selection:text-background">
        {children}
      </body>
    </html>
  );
}
