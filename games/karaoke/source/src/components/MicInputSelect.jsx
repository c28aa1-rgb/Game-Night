import { useMic } from "../lib/useMic.jsx";

export default function MicInputSelect() {
  const { status, devices, selectedDeviceId, chooseDevice, error } = useMic();
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
      {error && <small role="status">{error}</small>}
    </div>
  );
}
