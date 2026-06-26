import WhatsAppIcon from "./WhatsAppIcon";
import { cn } from "../../lib/utils";

/** Site-wide WhatsApp contact number (no leading + or spaces) */
export const WHATSAPP_NUMBER = "917518856804";

interface WhatsAppButtonProps {
  /** Optional pre-filled chat message */
  message?: string;
  /** Tailwind size for the icon container */
  className?: string;
  /** Icon pixel size */
  iconSize?: number;
  title?: string;
  variant?: "circle" | "plain";
}

const WhatsAppButton = ({
  message,
  className,
  iconSize = 18,
  title = "Chat on WhatsApp",
  variant = "circle",
}: WhatsAppButtonProps) => {
  const href = `https://wa.me/${WHATSAPP_NUMBER}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        variant === "circle"
          ? "inline-flex items-center justify-center h-8 w-8 rounded-full border border-[#25D366]/40 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-colors"
          : "inline-flex items-center gap-1 text-[#25D366] hover:opacity-80 transition-opacity",
        className
      )}
    >
      <WhatsAppIcon size={iconSize} />
    </a>
  );
};

export default WhatsAppButton;
