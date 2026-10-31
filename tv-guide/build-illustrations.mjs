// Original, simplified system-menu examples. No visitor screenshots or device names.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = fileURLToPath(new URL("../hub/public/tv-guide/illustrations/", import.meta.url));
await mkdir(output, { recursive: true });
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const box = (x, y, w, h, fill = "#fff", radius = 18, stroke = "none", sw = 1) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + radius + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
const txt = (x, y, value, size = 28, fill = "#172039", weight = 500) => '<text x="' + x + '" y="' + y + '" fill="' + fill + '" font-size="' + size + '" font-weight="' + weight + '">' + escape(value) + "</text>";
const line = (x, y, w) => box(x, y, w, 1, "#d9dce5", 0);
const highlight = (x, y, w, h) => box(x, y, w, h, "#edf1ff", 12, "#259891", 5);
const cursor = (x, y) => '<g transform="translate(' + x + " " + y + ')"><path d="M0 0 0 43 12 32 23 53 33 48 22 28 39 26Z" fill="#fff" stroke="#12204f" stroke-width="3" stroke-linejoin="round"/></g>';
const monitor = (x, y, color = "#343b55", scale = 1) => '<g transform="translate(' + x + " " + y + ") scale(" + scale + ')"><rect x="0" y="0" width="36" height="24" rx="3" fill="none" stroke="' + color + '" stroke-width="2.7"/><path d="M18 24v7m-9 0h18" fill="none" stroke="' + color + '" stroke-width="2.7" stroke-linecap="round"/></g>';
const mirror = (x, y, color = "#172039", scale = 1) => '<g transform="translate(' + x + " " + y + ") scale(" + scale + ')"><rect x="0" y="0" width="28" height="22" rx="3" fill="none" stroke="' + color + '" stroke-width="2.5"/><rect x="12" y="10" width="28" height="22" rx="3" fill="#e9edfa" stroke="' + color + '" stroke-width="2.5"/></g>';
const base = (content) => '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#354653"/><stop offset="1" stop-color="#1c2630"/></linearGradient><filter id="s"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#03082e" flood-opacity=".28"/></filter></defs><style>text{font-family:Segoe UI,Arial,sans-serif}</style>' + box(0, 0, 1000, 620, "url(#bg)", 24) + content + "</svg>";
const panel = (content, x = 190, y = 42, w = 620, h = 536) => '<g filter="url(#s)">' + box(x, y, w, h, "#f4f5f9", 22) + "</g>" + content;
const phone = (content) => box(254, 12, 492, 596, "#050a1b", 42) + box(266, 24, 468, 572, "#e9edfa", 32) + txt(294, 62, "9:41", 20, "#172039", 650) + txt(642, 62, "•••", 22) + content;
const assets = {};
assets["windows-cast"] = panel(
  txt(224, 100, "Cast", 32, "#172039", 650) + txt(756, 99, "×", 30) +
  txt(224, 167, "Available displays", 23, "#555f75") + line(224, 190, 550) +
  highlight(218, 216, 564, 105) + monitor(247, 247, "#20365f", 1.25) +
  txt(315, 258, "Living room TV", 29, "#172039", 600) + txt(315, 292, "Display", 20, "#59627a") +
  txt(224, 395, "Looking for your TV…", 22, "#6a7285") + line(224, 454, 550) +
  txt(224, 504, "Find other types of devices", 22, "#2359aa") + cursor(686, 278)
);
assets["mac-control"] =
  box(90, 18, 820, 42, "#e6eafa", 12) + txt(124, 47, "Finder    File    Edit    View", 19) +
  box(770, 23, 49, 31, "#b9e9d7", 7) +
  '<g transform="translate(783 31)" stroke="#15203c" stroke-width="2.4"><path d="M0 2h23M0 14h23"/><circle cx="7" cy="2" r="4" fill="#e6eafa"/><circle cx="17" cy="14" r="4" fill="#e6eafa"/></g>' +
  panel(txt(224, 110, "Control Center", 30, "#172039", 650) +
    box(224, 144, 274, 170, "#e1e6f4", 18) + txt(247, 192, "◉  Wi-Fi", 26) + txt(247, 232, "◉  Bluetooth", 26) + txt(247, 274, "◉  AirDrop", 26) +
    box(518, 144, 258, 78, "#e1e6f4", 18) + txt(544, 193, "Focus", 25) +
    highlight(518, 237, 258, 77) + mirror(540, 257, "#172039", .85) + txt(592, 269, "Screen", 22) + txt(592, 295, "Mirroring", 22) +
    box(224, 338, 552, 81, "#e1e6f4", 18) + txt(247, 373, "Display", 20) + box(247, 390, 496, 9, "#9caaca", 5) +
    box(224, 440, 552, 81, "#e1e6f4", 18) + txt(247, 477, "Sound", 20) + box(247, 494, 496, 9, "#9caaca", 5) + cursor(739, 285), 190, 80, 620, 480);
assets["mac-devices"] = panel(
  txt(224, 105, "Screen Mirroring", 31, "#172039", 650) + mirror(715, 78, "#172039", 1) +
  txt(224, 166, "Mirror or extend your display", 23, "#606a7c") +
  highlight(218, 215, 564, 100) + monitor(245, 246, "#20365f", 1.25) +
  txt(314, 263, "Living room TV", 29, "#172039", 600) + cursor(690, 279) +
  line(224, 362, 550) + txt(224, 412, "Display Settings…", 23, "#2359aa")
);
assets["ios-control"] = phone(
  box(294, 88, 204, 170, "#cbd4eb", 28) + txt(318, 135, "◉    ◉", 33) + txt(318, 195, "◉    ◉", 33) +
  box(518, 88, 188, 170, "#cbd4eb", 28) + txt(548, 149, "Not Playing", 21) + txt(559, 210, "◀  ▶  ▶", 24) +
  box(294, 278, 92, 90, "#cbd4eb", 23) + txt(324, 335, "↻", 38) +
  highlight(404, 278, 94, 90) + mirror(426, 306, "#172039", 1.12) +
  box(518, 278, 82, 186, "#cbd4eb", 26) + txt(540, 421, "☀", 34) +
  box(622, 278, 84, 186, "#cbd4eb", 26) + txt(649, 420, "♪", 35) +
  box(294, 389, 204, 75, "#cbd4eb", 23) + txt(322, 436, "Focus", 25) +
  box(294, 484, 92, 78, "#cbd4eb", 23) + box(404, 484, 94, 78, "#cbd4eb", 23) +
  txt(306, 538, "◉", 32) + txt(431, 535, "▣", 32) + cursor(473, 346)
);
assets["ios-devices"] = phone(
  txt(300, 139, "Screen Mirroring", 32, "#172039", 650) +
  highlight(289, 189, 421, 95) + monitor(310, 219, "#20365f", 1.05) +
  txt(365, 245, "Living room TV", 27, "#172039", 600) + cursor(658, 255) +
  txt(303, 354, "Choose an AirPlay display.", 23, "#65718b")
);
assets["android-smartview"] = phone(
  txt(298, 122, "Quick settings", 31, "#172039", 650) +
  box(292, 158, 195, 96, "#cbd4eb", 25) + txt(322, 216, "Wi-Fi", 25) +
  box(509, 158, 198, 96, "#cbd4eb", 25) + txt(531, 216, "Bluetooth", 24) +
  box(292, 277, 195, 98, "#cbd4eb", 25) + txt(322, 333, "Sound", 25) +
  highlight(509, 277, 198, 98) + mirror(529, 304, "#172039", .9) + txt(578, 334, "Smart View", 21) +
  box(292, 400, 415, 64, "#cbd4eb", 24) + txt(320, 442, "Brightness", 22) + cursor(666, 350)
);
assets["android-devices"] = phone(
  txt(298, 133, "Smart View", 33, "#172039", 650) +
  txt(298, 184, "Phone → Other device", 22, "#65718b") +
  highlight(289, 228, 421, 95) + monitor(311, 258, "#20365f", 1.05) +
  txt(366, 285, "Living room TV", 27, "#172039", 600) + cursor(661, 292) +
  txt(298, 398, "Available devices", 21, "#65718b")
);
assets["android-home"] = phone(
  txt(298, 126, "Google Home", 33, "#172039", 650) +
  txt(298, 184, "Devices", 26, "#2359aa", 600) +
  highlight(290, 223, 418, 197) + monitor(326, 257, "#20365f", 1.5) +
  txt(325, 350, "Living room TV", 29, "#172039", 600) + txt(325, 387, "Living room", 21, "#65718b") + cursor(661, 373) +
  txt(298, 542, "Favorites    Devices    Activity", 19, "#65718b")
);
assets["android-cast"] = phone(
  txt(298, 128, "Living room TV", 31, "#172039", 650) + monitor(444, 200, "#2359aa", 2.8) +
  txt(383, 364, "Ready to cast", 27, "#65718b") +
  highlight(291, 424, 417, 88) + mirror(321, 451, "#172039", 1) + txt(383, 479, "Cast my screen", 28, "#172039", 600) + cursor(661, 480)
);
assets["android-permission"] = phone(
  box(292, 151, 416, 348, "#fdfdff", 26) + txt(318, 203, "Share your screen?", 29, "#172039", 650) +
  txt(318, 250, "Google Home can see what's", 21, "#65718b") + txt(318, 281, "shown on your screen.", 21, "#65718b") +
  highlight(311, 315, 376, 64) + txt(334, 357, "◉  Entire screen", 25) +
  txt(329, 449, "Cancel", 22, "#65718b") + box(495, 407, 190, 64, "#2359aa", 32) + txt(521, 449, "Start now", 24, "#fff", 600) + cursor(640, 456)
);
assets["chrome-menu"] = panel(
  txt(222, 103, "Chrome", 29, "#172039", 650) + txt(747, 100, "⋮", 34) +
  txt(222, 168, "New tab", 25) + txt(222, 223, "History", 25) + txt(222, 278, "Downloads", 25) +
  highlight(212, 307, 574, 65) + txt(236, 349, "Cast, save, and share", 28, "#172039", 600) + txt(744, 349, "›", 32) +
  box(336, 385, 445, 139, "#fff", 12, "#d9deeb", 1) + highlight(346, 397, 424, 65) +
  txt(373, 440, "Cast…", 28, "#172039", 600) + txt(373, 499, "Save page as…", 23, "#65718b") + cursor(715, 437)
);
const chromeTop = txt(224, 103, "Cast tab", 31, "#172039", 650) + txt(224, 155, "Choose a device", 23, "#65718b");
assets["chrome-source"] = panel(chromeTop +
  box(224, 190, 552, 99, "#e8ebf3", 14) + monitor(249, 220) + txt(310, 247, "Living room TV", 28) +
  box(224, 329, 552, 175, "#fff", 13, "#cbd2e4", 1) +
  txt(247, 369, "Sources", 23, "#65718b") + highlight(238, 386, 523, 56) +
  txt(258, 423, "✓   Cast tab", 27, "#172039", 600) + txt(258, 478, "Cast screen", 26, "#65718b") + cursor(695, 422)
);
assets["chrome-devices"] = panel(chromeTop +
  highlight(218, 202, 564, 107) + monitor(246, 239, "#20365f", 1.2) + txt(312, 264, "Living room TV", 29, "#172039", 600) +
  txt(224, 396, "Sources: Cast tab", 23, "#2359aa") + cursor(697, 273)
);
const tvFrame = (screen) => box(82, 60, 836, 475, "#020718", 22) + box(98, 76, 804, 443, "#16296e", 12) + box(467, 535, 66, 28, "#020718", 3) + box(376, 563, 248, 13, "#020718", 5) + screen;
assets["tv-allow"] = tvFrame(
  txt(250, 153, "Screen mirroring request", 32, "#fff", 650) + txt(263, 215, "A device wants to show its screen.", 25, "#d7ddf4") +
  box(237, 306, 243, 80, "#263a7d", 12) + txt(307, 359, "Deny", 29, "#fff") +
  box(516, 306, 243, 80, "#b9e9d7", 12) + txt(583, 359, "Allow", 29, "#16204a", 650) + cursor(722, 361)
);
assets["tv-code"] = tvFrame(
  mirror(462, 115, "#e6eafa", 1.7) + txt(347, 227, "AirPlay code", 34, "#fff", 600) +
  txt(307, 354, "4 8 2 1", 85, "#b9e9d7", 650) + txt(273, 438, "Enter this code on your device.", 27, "#d7ddf4")
);
assets["tv-source"] = tvFrame(
  txt(143, 148, "Source", 34, "#fff", 650) +
  box(142, 225, 211, 166, "#263a7d", 13) + monitor(222, 251, "#fff", 1.2) + txt(205, 354, "Live TV", 27, "#fff") +
  box(383, 225, 211, 166, "#b9e9d7", 13) + monitor(462, 251, "#16204a", 1.2) + txt(440, 354, "HDMI 1", 29, "#16204a", 650) +
  box(623, 225, 211, 166, "#263a7d", 13) + monitor(701, 251, "#fff", 1.2) + txt(678, 354, "HDMI 2", 27, "#fff") + cursor(553, 368)
);
assets["tv-volume"] = tvFrame(
  txt(316, 187, "Sound comes from the TV", 30, "#fff", 600) +
  txt(360, 288, "♪", 83, "#b9e9d7") + box(452, 244, 310, 22, "#52618f", 11) + box(452, 244, 218, 22, "#b9e9d7", 11) +
  txt(283, 410, "Use the TV remote to set the volume.", 26, "#d7ddf4")
);
assets["sound-output"] = panel(
  txt(224, 104, "Sound", 33, "#172039", 650) + txt(224, 168, "Output", 27, "#172039", 600) +
  txt(224, 208, "Choose where to play sound", 23, "#65718b") +
  highlight(218, 243, 564, 94) + txt(247, 300, "◉   TV / HDMI audio", 29, "#172039", 600) +
  box(224, 364, 552, 78, "#e5e9f3", 12) + txt(247, 414, "○   Computer speakers", 27, "#65718b") + cursor(704, 309)
);
assets["hdmi-cable"] =
  box(75, 139, 330, 229, "#040a25", 15) + box(89, 153, 302, 200, "#425d6a", 7) + txt(139, 240, "Your game", 40, "#fff", 650) +
  '<path d="M59 375h362l32 42H27Z" fill="#b3bce6"/>' + txt(167, 463, "COMPUTER", 23, "#d7ddff", 650) +
  box(606, 113, 330, 246, "#040a25", 15) + box(620, 127, 302, 218, "#425d6a", 7) + txt(672, 217, "Your game", 40, "#fff", 650) +
  box(749, 359, 48, 28, "#040a25", 3) + box(701, 387, 144, 10, "#040a25", 5) + txt(740, 463, "TV", 23, "#d7ddff", 650) +
  '<path d="M403 289C470 289 472 387 535 387S562 295 606 295" fill="none" stroke="#b9e9d7" stroke-width="12"/>' +
  box(389, 267, 29, 45, "#b9e9d7", 5) + box(592, 272, 29, 45, "#b9e9d7", 5) +
  txt(441, 235, "HDMI", 34, "#b9e9d7", 650) + txt(655, 528, "HDMI IN 1", 25, "#b9e9d7", 650) +
  txt(103, 542, "One cable carries picture + sound", 26, "#d7ddff");

for (const [name, content] of Object.entries(assets)) {
  await sharp(Buffer.from(base(content))).png({ compressionLevel: 9 }).toFile(output + "/" + name + ".png");
}

// Canvas-design study: one visual sheet that establishes the guide's visual grammar.
const preview = fileURLToPath(new URL("./design-preview.png", import.meta.url));
const study = base(
  txt(60, 86, "SCREEN TOGETHER", 32, "#b9e9d7", 650) + txt(60, 137, "A familiar gesture. A bigger screen.", 35, "#f6f4ff", 650) +
  box(62, 235, 172, 160, "#f6f4ff", 23) + txt(110, 331, "⊞", 76, "#172657", 650) +
  txt(263, 338, "+", 54, "#99a9f1") + box(326, 235, 172, 160, "#b9e9d7", 23) + txt(383, 338, "K", 82, "#172657", 650) +
  '<path d="M540 317h64m-17-17 18 17-18 17" fill="none" stroke="#259891" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
  box(651, 230, 278, 175, "#f6f4ff", 18) + txt(676, 272, "Cast", 27, "#172039", 650) + highlight(672, 300, 236, 65) + txt(694, 340, "Living room TV", 23, "#172039", 600) +
  txt(63, 518, "01  HOLD + TAP", 21, "#d7ddff") + txt(650, 518, "02  CHOOSE YOUR TV", 21, "#d7ddff") +
  txt(63, 570, "Original illustrated setup examples · Shared Game Night theme · 2026", 17, "#aab7f4")
);
await sharp(Buffer.from(study)).png().toFile(preview);
console.log("Created " + Object.keys(assets).length + " TV guide PNG illustrations and the design canvas.");
