import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

export { React, AnimatePresence, motion, useEffect, useMemo, useRef, useState };

export const POSITIONS = 61;
export const MIDPOINT = 30;
// This is the one mechanical truth of the board: every moving piece pivots
// around the bottom-centre axle. Keeping all geometry derived from it avoids
// the "floating needle" effect at the ends of the spectrum.
const PIVOT = { x: 500, y: 570 };
const RADIUS = 390;

export function pointFor(index, radius = RADIUS) {
  const angle = (180 + (180 * index) / (POSITIONS - 1)) * Math.PI / 180;
  return { x: PIVOT.x + radius * Math.cos(angle), y: PIVOT.y + radius * Math.sin(angle) };
}

function arcPath(start, end, radius = RADIUS) {
  const a = pointFor(Math.max(0, start), radius);
  const b = pointFor(Math.min(POSITIONS - 1, end), radius);
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${end - start > 30 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

function sectorPath(start, end, outerRadius = RADIUS, innerRadius = 146) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(POSITIONS - 1, end);
  const outerStart = pointFor(safeStart, outerRadius);
  const outerEnd = pointFor(safeEnd, outerRadius);
  const innerEnd = pointFor(safeEnd, innerRadius);
  const innerStart = pointFor(safeStart, innerRadius);
  const largeArc = safeEnd - safeStart > 30 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
}

function labelPoint(index) { return pointFor(index, 262); }
function needleRotation(index) { return -90 + (180 * index) / (POSITIONS - 1); }
function cleanLabel(value, fallback) { return String(value || fallback).slice(0, 28); }

function ScoreNumber({ index, value }) {
  const p = labelPoint(index);
  return <text className="wheel__score-number" x={p.x} y={p.y + 7}>{value}</text>;
}

/**
 * An original physical-dial interpretation: a cream tabletop body, scoring
 * windows, a movable shield, and a brass pivot needle. The interaction is
 * still driven by the server's discrete marker index.
 */
export function SpectrumArc({ markerIndex = MIDPOINT, targetIndex = null, className = '', privateView = false, lowLabel, highLabel }) {
  const showTarget = Number.isInteger(targetIndex);
  const rotation = needleRotation(markerIndex);
  const left = cleanLabel(lowLabel, 'LOW');
  const right = cleanLabel(highLabel, 'HIGH');
  const target = targetIndex ?? MIDPOINT;

  return (
    <svg className={`spectrum ${className}`} viewBox="0 0 1000 720" role="img"
      aria-label={showTarget ? 'Spectrum target revealed' : `Guess needle at position ${markerIndex + 1} of ${POSITIONS}`}>
      <defs>
        <linearGradient id="shieldFace" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#456f91" /><stop offset="1" stopColor="#274f70" /></linearGradient>
        <clipPath id="wheelStageClip"><path d={sectorPath(0, POSITIONS - 1, 406, 0)} /></clipPath>
      </defs>

      <path className="wheel__track" d={arcPath(0, POSITIONS - 1, RADIUS)} />

      {Array.from({ length: 25 }, (_, i) => i * 2 + 6).map((index) => {
        const a = pointFor(index, 402); const b = pointFor(index, index % 10 === 0 ? 383 : 391);
        return <path className="wheel__tick" key={index} d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`} />;
      })}

      <AnimatePresence initial={false}>
        {showTarget && <motion.g key={`target-${target}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .2, ease: 'easeOut' }}>
          <path className="wheel__band wheel__band--two" d={sectorPath(target - 8, target - 4.5)} />
          <path className="wheel__band wheel__band--three" d={sectorPath(target - 4.5, target - 1.8)} />
          <path className="wheel__band wheel__band--four" d={sectorPath(target - 1.8, target + 1.8)} />
          <path className="wheel__band wheel__band--three" d={sectorPath(target + 1.8, target + 4.5)} />
          <path className="wheel__band wheel__band--two" d={sectorPath(target + 4.5, target + 8)} />
          <ScoreNumber index={target - 6.25} value="2" /><ScoreNumber index={target - 3.15} value="3" />
          <ScoreNumber index={target} value="4" /><ScoreNumber index={target + 3.15} value="3" /><ScoreNumber index={target + 6.25} value="2" />
        </motion.g>}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!showTarget && <motion.g key="shield" className="wheel__shield" clipPath="url(#wheelStageClip)" initial={{ rotate: -8, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 180 }} transition={{ duration: 1.06, ease: [0.22, 0.78, 0.18, 1] }} style={{ originX: .5, originY: 1 }}>
          <path className="wheel__shield-panel" d={sectorPath(0, POSITIONS - 1, 404, 132)} />
          <path className="wheel__shield-arc" d={arcPath(4, POSITIONS - 5, 365)} />
          <text x="500" y="317">SECRET TARGET</text><text x="500" y="343">SEALED FOR THE CLUE-GIVER</text>
        </motion.g>}
      </AnimatePresence>

      <motion.g className="wheel__needle" initial={false} animate={{ rotate: rotation }} style={{ originX: .5, originY: 1 }} transition={{ type: 'spring', stiffness: 310, damping: 27, mass: .9 }}>
        <path d="M 500 569 L 494 178 L 506 178 Z" />
        <path className="wheel__needle-highlight" d="M 500 550 L 498 196 L 502 196 Z" />
        <circle cx="500" cy="570" r=".1" fill="transparent" />
      </motion.g>
      <circle className="wheel__pivot-shadow" cx="500" cy="570" r="34" />
      <circle className="wheel__pivot" cx="500" cy="570" r="27" /><circle className="wheel__pivot-cap" cx="500" cy="570" r="10" />

      <g className="wheel__cards"><rect x="80" y="626" width="352" height="68" rx="6" /><rect x="568" y="626" width="352" height="68" rx="6" />
        <text x="104" y="652">{left}</text><text x="104" y="676">LEFT END</text>
        <text x="896" y="652" textAnchor="end">{right}</text><text x="896" y="676" textAnchor="end">RIGHT END</text>
      </g>
      {privateView && <text className="wheel__private" x="500" y="606">LOOK, CLUE, THEN PASS THE PHONE</text>}
    </svg>
  );
}

export function useRoomSocket(onState) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const callbackRef = useRef(onState);
  callbackRef.current = onState;

  useEffect(() => {
    const socket = window.io('/wavelength');
    socketRef.current = socket;
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (state) => callbackRef.current?.({ state }));
    socket.on('private_state', (privateState) => callbackRef.current?.({ privateState }));
    return () => socket.disconnect();
  }, []);

  function emit(name, payload = {}) {
    return new Promise((resolve) => socketRef.current?.emit(name, payload, (result = {}) => resolve(result)));
  }
  return { connected, emit, socketRef };
}

export function readRoomFromUrl() { return new URLSearchParams(window.location.search).get('room')?.toUpperCase() || ''; }
export function teamName(team) { return `TEAM ${Number(team) + 1}`; }
export function scoreWords(points) { return points === 4 ? 'DEAD CENTER' : points === 3 ? 'CLOSE READ' : points === 2 ? 'IN THE WINDOW' : 'JUST OUTSIDE'; }
