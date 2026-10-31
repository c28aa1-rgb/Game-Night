import { useMic } from "../lib/useMic.jsx";

export default function MicProcessingSelect() {
  const { status, inputMode, chooseInputMode } = useMic();
  return (
    <div className="mic-processing">
      <label className="stage-audio-mode">
        <span><b>Mic sound</b></span>
        <select value={inputMode} disabled={status === "starting"} onChange={(event) => chooseInputMode(event.target.value)}>
          <option value="low-latency">Natural vocals</option>
          <option value="feedback">Echo reduction</option>
        </select>
      </label>
      <p className="stage-audio-note">
        {inputMode === "feedback"
          ? "Echo reduction can cut out singing. Switch to Natural vocals if your voice fades or breaks up."
          : "Keeps your voice intact without speech noise suppression or automatic gain. Keep the mic away from speakers to prevent feedback."}
      </p>
    </div>
  );
}
