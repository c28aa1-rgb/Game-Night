# House Lights — tutorial theme

House Lights is a custom presentation frame derived from the arcade. Each game keeps its own interface, colors, and typography while the tutorial controls remain consistent.

## Core palette

- House black — `#07090D`: tutorial field and device surround
- Projector white — `#F4F2EC`: primary instructional text
- Ash — `#A7ABB4`: captions and quiet navigation
- Rail — `#242833`: separators, bezels, and secondary controls
- Glass — `rgba(255,255,255,.08)`: translucent control surfaces
- Game signal — Hitster `#FF2E92`, Codenames `#E01B2E`, Mafia `#FF3B1F`, Hues & Cues `#F9680D`, Wavelength `#F3B342`, Chameleon `#98C93C`

## Type roles

- Display: the current game’s display face where available
- Body: `Inter`, `Avenir Next`, `Segoe UI`, system sans-serif fallback
- Utility: `IBM Plex Mono`, `SFMono-Regular`, `Consolas`, monospace fallback

## Layout

The stage keeps a 16:9 TV and a 390:844 phone visible together. Their weight changes by action: the phone grows when a player chooses, while the TV grows when the room sees a reveal or score. Copy stays beside or below the stage and never covers gameplay.

## Signature

A cause-and-effect rail sits below the devices. It names the current gameplay beat, offers direct keyframe buttons, and makes the phone-to-TV result explicit. Replay demo restarts the current sequence without changing slides.

## Motion identity

- Personality: calm, instructional, and tactile
- Signature easing: `cubic-bezier(.2,0,0,1)`
- Slide duration: 16 seconds
- Gameplay beat duration: 4.5 seconds, or 4.8 seconds for detailed three-step actions
- State transition: 240–460ms crossfade or physical control response
- Slide transition: 250ms vertical dissolve with no lateral travel
- Audio: none
- Reduced motion: immediate state changes with the same keyframe controls
