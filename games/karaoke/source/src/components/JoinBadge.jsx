import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { joinUrl, useRoom } from "../lib/room.jsx";
import { springSoft } from "../lib/motion.js";

// Always in the TV's top-left: scan the QR or type the code to join from a phone.
export default function JoinBadge({ compact = false }) {
  const { code, state, status } = useRoom();
  const [svg, setSvg] = useState("");
  const url = joinUrl(code);

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0A0C3AFF", light: "#F6F4FFFF" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  const site = `${location.host}${location.pathname}`.replace(/\/$/, "");
  const phones = state?.phones ?? 0;

  return (
    <motion.aside
      className={`join ${compact ? "join--compact" : ""}`}
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={springSoft}
      aria-label={`Join from your phone: go to ${site} and enter code ${code}`}
    >
      <div className="join-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="join-text">
        <span className="join-label">{compact ? "Add a song" : "Scan to add songs"}</span>
        <span className="join-code vfd">{code}</span>
        {!compact && <span className="join-site">or go to {site} and enter the code</span>}
        <span className={`join-phones ${status !== "live" ? "is-off" : ""}`}>
          {status === "live" ? `${phones} ${phones === 1 ? "phone" : "phones"} connected` : status === "gone" ? "Party ended" : "Reconnecting…"}
        </span>
      </div>
    </motion.aside>
  );
}
