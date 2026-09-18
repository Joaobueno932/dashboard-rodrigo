import logoWhite from "./assets/logo-csi-fiems-branco.png";
import logoColor from "./assets/logo-csi-fiems-colorido.png";

/** Official CSI | Sistema FIEMS logo, cropped from the brand files. */
export function Logo({
  variant = "white",
  className = "",
}: {
  variant?: "white" | "color";
  className?: string;
}) {
  return (
    <img
      src={variant === "white" ? logoWhite : logoColor}
      alt="CSI | Sistema FIEMS"
      className={className}
      width={720}
      height={167}
    />
  );
}

/** Geometric block motif from the visual identity: tiles, half discs and a notch. */
export function BrandShapes({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`brand-shapes ${className}`}
      viewBox="0 0 400 200"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="100" height="100" fill="#62a6c3" />
      <path d="M100 0 A50 50 0 0 0 100 100 Z" fill="#f2eeda" />
      <rect x="100" y="0" width="100" height="100" fill="#f2eeda" />
      <path d="M100 0 A50 50 0 0 1 100 100 Z" fill="#62a6c3" />
      <rect x="200" y="0" width="100" height="100" fill="#0080c6" />
      <path d="M200 0 H300 L250 55 Z" fill="#10263d" />
      <rect x="300" y="0" width="100" height="100" fill="#62a6c3" />
      <path d="M350 0 A50 50 0 0 1 350 100 Z" fill="#f2eeda" />
      <path d="M350 0 A50 50 0 0 0 350 100 Z" fill="#0c4da2" />
      <rect x="0" y="100" width="100" height="100" fill="#0c4da2" />
      <path d="M0 200 A100 100 0 0 1 100 100 V200 Z" fill="#0080c6" />
      <rect x="100" y="100" width="100" height="100" fill="#10263d" />
      <path d="M100 100 H200 V200 Z" fill="#0c4da2" />
      <rect x="200" y="100" width="100" height="100" fill="#def6ff" />
      <circle cx="250" cy="150" r="30" fill="#0080c6" />
      <rect x="300" y="100" width="100" height="100" fill="#0080c6" />
      <path d="M300 200 L400 100 V200 Z" fill="#10263d" />
    </svg>
  );
}
