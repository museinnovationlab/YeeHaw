/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Brand stickers are local PNGs in /public/brand/parts; no remote loaders needed yet.
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
