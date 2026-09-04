import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // King Juan Cup team crests (kingjuan-assets repo)
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      // Google account avatars (Auth.js)
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      // Uploaded avatars and team crests (Vercel Blob)
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async redirects() {
    return [
      // The forum moved to /community. Links to posts are already out there.
      { source: "/discussions", destination: "/community", permanent: true },
      {
        source: "/discussions/:path*",
        destination: "/community/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
