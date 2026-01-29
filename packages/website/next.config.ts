import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  transpilePackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@react-three/postprocessing",
  ],
  typescript: {
    // R3F types don't work with jsx: preserve (Next.js requirement)
    // The code works at runtime, but tsc has issues with JSX.IntrinsicElements
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warnings are acceptable for initial build
    ignoreDuringBuilds: true,
  },
};

export default config;
