# Herd Mentality Audio Direction

## Sound thesis

The TV sounds like a warm country-fair game booth after dark: tactile wood, soft felt, small bells, and a playful low-register cow gesture. Audio supports the room rather than competing with conversation. Phones only confirm the action taken on that phone.

## Palette and timing

- Lobby: shared arcade music engine using the `herd-mentality` identity, owned by the TV only. Fade behavior comes from the shared engine.
- Question: low card landing and a short wooden slap, under 400 ms.
- Answers open: three-note gate-opening figure, under 500 ms.
- Answer lock: immediate wood click followed by a warm confirmation ping, with a 300 ms tail.
- Review: single closed-gate clack and low rising tone. No ticking loop, so deliberation stays calm.
- Reveal: four-note rising chime over roughly 400 ms. A sole odd answer adds a filtered downward comic glide after the chime.
- Win: compact five-note fairground cadence with a low body tone, under two seconds.
- Error: two short descending tones, under 350 ms.

## Mix

- Master: `-3 dB`, with a compressor limiting peaks around `-3 dB`.
- Primary SFX bus: `-9 dB`, within the `-12 to -8 dB` target range.
- Individual cue voices are attenuated again to preserve headroom when tones overlap.
- The TV owns music and shared events. Phones have no background music and only play local confirmation/error cues.
- All sustained tails use exponential release ramps to avoid clicks. Mute transitions use a short gain ramp.

## Accessibility and control

- TV and phone controls expose persistent, independent sound preferences.
- Audio remains silent until a browser-approved pointer or keyboard gesture unlocks the audio context.
- No cue carries information that is unavailable visually.
- All sounds are synthesized with the Web Audio API; there are no third-party audio assets or licensing dependencies.
