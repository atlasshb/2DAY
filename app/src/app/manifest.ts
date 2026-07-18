import type { MetadataRoute } from "next";

/** A single inline 512×512 SVG icon — accent-blue "2DAY" mark on the Fieldkit
 *  night background, avoids shipping a binary asset for the prototype port. */
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0B0F14"/>
  <circle cx="256" cy="196" r="108" fill="#3B82F6"/>
  <text x="256" y="230" text-anchor="middle" font-family="-apple-system,Segoe UI,Inter,sans-serif" font-size="108" font-weight="700" fill="#0B0F14">2</text>
  <text x="256" y="410" text-anchor="middle" font-family="-apple-system,Segoe UI,Inter,sans-serif" font-size="88" font-weight="700" letter-spacing="2" fill="#E8EDF2">DAY</text>
</svg>`;

const ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG)}`;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "2DAY — Field OS",
    short_name: "2DAY",
    description: "The field operating system for door-to-door sales.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    orientation: "portrait",
    icons: [
      {
        src: ICON_DATA_URI,
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: ICON_DATA_URI,
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
