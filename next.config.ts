import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16 blocks cross-origin dev resources (HMR, RSC Flight
  // stream) by default. We run the dev server on a Mac Mini and
  // browse it from a MacBook Pro via the LAN IP, so Next treats the
  // request as cross-origin and silently breaks React hydration on
  // the network-IP origin. Allowlisting the LAN IP + any linkable
  // hostname restores HMR / RSC streaming so the client-side
  // components can hydrate and attach event handlers.
  //
  // Add more hostnames / IPs here if the device moves networks.
  allowedDevOrigins: [
    "192.168.1.236",
    "*.local",
    "localhost",
  ],
};

export default nextConfig;
