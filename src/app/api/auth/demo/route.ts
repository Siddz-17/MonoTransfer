import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { Provider } from "@prisma/client";
import { encryptToken } from "@/lib/crypto";

export async function POST() {
  try {
    const demoEmail = "demo.nothing@monotransfer.internal";
    let user = await prisma.user.findUnique({
      where: { email: demoEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: demoEmail,
          name: "GLYPH OPERATOR",
          preference: {
            create: {
              skipDuplicates: true,
              retryFailedMatches: true,
              matchExplicitVersions: true,
              matchLiveVersions: false,
              privatePlaylist: true,
              minimumConfidenceThreshold: 0.72,
            },
          },
        },
      });
    }

    // Seed mock Spotify and Google connections
    const enc = encryptToken("demo_token_mock_val");
    const expiresAt = new Date(Date.now() + 30 * 86400 * 1000);

    await prisma.connection.upsert({
      where: { userId_provider: { userId: user.id, provider: Provider.SPOTIFY } },
      update: {},
      create: {
        userId: user.id,
        provider: Provider.SPOTIFY,
        providerUserId: "spotify_demo_user",
        accessTokenEnc: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        expiresAt,
      },
    });

    await prisma.connection.upsert({
      where: { userId_provider: { userId: user.id, provider: Provider.GOOGLE } },
      update: {},
      create: {
        userId: user.id,
        provider: Provider.GOOGLE,
        providerUserId: "google_demo_user",
        accessTokenEnc: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        expiresAt,
      },
    });

    // Seed sample playlists if not present
    const count = await prisma.playlist.count({ where: { userId: user.id } });
    if (count === 0) {
      const p1 = await prisma.playlist.create({
        data: {
          userId: user.id,
          spotifyId: "demo_pl_industrial_techno",
          name: "INDUSTRIAL SOUNDSCAPES // 01",
          description: "Curated monochromatic frequencies, ambient drones and analog modular rhythms.",
          trackCount: 8,
          tracks: {
            create: [
              { spotifyTrackId: "t1", title: "Vordhosbn", artist: "Aphex Twin", album: "Drukqs", durationMs: 282000, isExplicit: false, position: 0 },
              { spotifyTrackId: "t2", title: "Windowlicker", artist: "Aphex Twin", album: "Windowlicker", durationMs: 367000, isExplicit: true, position: 1 },
              { spotifyTrackId: "t3", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", durationMs: 243000, isExplicit: false, position: 2 },
              { spotifyTrackId: "t4", title: "Genesis", artist: "Justice", album: "Cross", durationMs: 234000, isExplicit: false, position: 3 },
              { spotifyTrackId: "t5", title: "Around The World", artist: "Daft Punk", album: "Homework", durationMs: 429000, isExplicit: false, position: 4 },
              { spotifyTrackId: "t6", title: "Resonance", artist: "HOME", album: "Odyssey", durationMs: 212000, isExplicit: false, position: 5 },
              { spotifyTrackId: "t7", title: "Hyperballad (Live in Cambridge)", artist: "Björk", album: "Post Live", durationMs: 341000, isExplicit: false, position: 6 },
              { spotifyTrackId: "t8", title: "Harder, Better, Faster, Stronger (Far Out Remix)", artist: "Daft Punk", album: "Discovery", durationMs: 224000, isExplicit: false, position: 7 },
            ],
          },
        },
      });

      await prisma.playlist.create({
        data: {
          userId: user.id,
          spotifyId: "demo_pl_retro_synth",
          name: "RETRO-FUTURISM FREQUENCIES",
          description: "Dot-matrix digital synthesis and cold wave baselines.",
          trackCount: 4,
          tracks: {
            create: [
              { spotifyTrackId: "t9", title: "Nightcall", artist: "Kavinsky", album: "OutRun", durationMs: 259000, isExplicit: false, position: 0 },
              { spotifyTrackId: "t10", title: "Giorgio by Moroder", artist: "Daft Punk", album: "Random Access Memories", durationMs: 544000, isExplicit: false, position: 1 },
              { spotifyTrackId: "t11", title: "A Real Hero", artist: "College & Electric Youth", album: "Drive OST", durationMs: 267000, isExplicit: false, position: 2 },
              { spotifyTrackId: "t12", title: "Contact", artist: "Daft Punk", album: "Random Access Memories", durationMs: 381000, isExplicit: false, position: 3 },
            ],
          },
        },
      });
    }

    await setSessionCookie({ userId: user.id, email: user.email, name: user.name });
    return NextResponse.json({ success: true, userId: user.id });
  } catch (error: any) {
    console.error("Demo login error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
