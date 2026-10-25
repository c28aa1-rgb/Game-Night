import { createPortal } from "react-dom";

// Overlays render at <body> so transformed/filtered screen wrappers can't trap `position: fixed`.
export default function Portal({ children }) {
  return createPortal(children, document.body);
}
