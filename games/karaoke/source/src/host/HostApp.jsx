import { AnimatePresence } from "framer-motion";
import { RoomProvider, useRoom } from "../lib/room.jsx";
import { MicProvider } from "../lib/useMic.jsx";
import { useCurrentVideo } from "../lib/useCurrentVideo.js";
import JoinBadge from "../components/JoinBadge.jsx";
import Lobby from "./Lobby.jsx";
import HostUpNext from "./HostUpNext.jsx";
import HostStage from "./HostStage.jsx";
import HostScore from "./HostScore.jsx";

function Screens({ session }) {
  const { state } = useRoom();
  const v = useCurrentVideo(state?.current, session);
  if (!state) return <div className="boot" aria-label="Connecting" />;
  const id = state.current?.id ?? "none";

  return (
    <div className={`host host--${state.phase}`}>
      <JoinBadge compact={state.phase !== "lobby"} />
      <AnimatePresence mode="wait">
        {state.phase === "lobby" && <Lobby key="lobby" />}
        {state.phase === "upnext" && <HostUpNext key={`up-${id}`} v={v} />}
        {state.phase === "playing" && <HostStage key={`stage-${id}`} v={v} />}
        {state.phase === "score" && <HostScore key={`score-${state.lastScore?.at}`} />}
      </AnimatePresence>
    </div>
  );
}

export default function HostApp({ session, onEnd }) {
  return (
    <RoomProvider code={session.code} hostToken={session.hostToken} onGone={onEnd}>
      <MicProvider>
        <Screens session={session} />
      </MicProvider>
    </RoomProvider>
  );
}
