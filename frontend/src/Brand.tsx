import logoWhite from "./assets/logo-csi-fiems-branco.png";
import logoColor from "./assets/logo-csi-fiems-colorido.png";
import simbolo from "./assets/simbolo-esg-branco.png";

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

/** Símbolo ESG do Sistema FIEMS, em traço branco, para uso sobre fundo escuro. */
export function BrandShapes({ className = "" }: { className?: string }) {
  return (
    <img
      src={simbolo}
      alt=""
      aria-hidden="true"
      className={`brand-shapes ${className}`}
      width={512}
      height={512}
    />
  );
}
