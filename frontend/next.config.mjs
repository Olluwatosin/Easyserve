/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // There is a lockfile at the repo root as well as in here, so Next 16 cannot
  // tell which directory is the workspace root and says so on every build.
  // It is this one.
  turbopack: { root: import.meta.dirname },

  images: {
    // Explicit allow-list — next/image refuses any host not named here, and
    // the failure is a quiet one: the optimiser returns 400 and the component
    // falls back, so every menu photo turns into an emoji tile with nothing
    // saying why.
    //
    // This listed **.supabase.co, which nothing uses, and **.easyserve.ng,
    // which is not a domain this project owns — the real one is easyserveng.com.
    // Menu photos now come from Cloudinary, so that is the host that matters.
    remotePatterns: [
      // Cloudinary delivery, where menu photos live.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // The API, which serves uploads itself when no CDN is configured.
      { protocol: "https", hostname: "**.easyserveng.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
