import { useMic } from "../lib/useMic.jsx";

export default function MicInputSelect() {
  const { status, devices, selectedDeviceId, chooseDevice, inputInfo, audioState, inputMode, resume, error } = useMic();
  if (status === "off") return null;

  return (
    <div className="mic-input-select">
      <label>
        <span>Microphone input</span>
        <select value={selectedDeviceId} disabled={status === "starting" || devices.length === 0} onChange={(event) => chooseDevice(event.target.value)}>
          <option value="">System default</option>
          {devices.map((device, index) => (
            <option key={`${device.deviceId || "input"}-${index}`} value={device.deviceId}>
              {device.label || `Microphone ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      {status === "starting" && <small>Connecting to microphone…</small>}
      {status === "on" && inputInfo?.label && <small>Using: {inputInfo.label}</small>}
      {status === "on" && audioState && audioState !== "running" && <>
        <small role="status">The browser paused mic playback.</small>
        <button className="chip" onClick={resume}>Resume mic audio</button>
      </>}
      {status === "on" && inputInfo?.muted && <small role="status">The microphone isn't sending audio. Check the receiver and connection.</small>}
      {status === "on" && (inputInfo?.noiseSuppression || inputInfo?.autoGainControl || (inputMode === "low-latency" && inputInfo?.echoCancellation)) && <small role="status">The browser reports extra voice processing is still enabled. Check your device's audio enhancements.</small>}
      {error && <small role="status">{error}</small>}
    </div>
  );
}
