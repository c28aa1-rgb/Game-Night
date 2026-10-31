export const platforms = [
  ["windows", "Windows"],
  ["mac", "Mac"],
  ["ios", "iPhone / iPad"],
  ["android", "Android"],
  ["linux", "Linux"],
  ["other", "Other device"],
];

export function detectTVPlatform(nav = navigator) {
  const ua = nav.userAgent || "";
  const platform = nav.userAgentData?.platform || nav.platform || "";
  if (/Android/i.test(ua + platform)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(platform) && nav.maxTouchPoints > 1)) return "ios";
  if (/Win/i.test(platform + ua)) return "windows";
  if (/Mac/i.test(platform + ua)) return "mac";
  if (/Linux|CrOS/i.test(platform + ua)) return "linux";
  return "other";
}

export function defaultTVMethod(platform) {
  return platform === "linux" || platform === "other" ? "chrome" : "wireless";
}

export function tvMethods(platform) {
  if (platform === "windows") return [["wireless", "Windows wireless"], ["chrome", "Chrome + Google Cast"], ["hdmi", "HDMI cable"]];
  if (platform === "mac") return [["wireless", "AirPlay"], ["chrome", "Chrome + Google Cast"], ["hdmi", "HDMI cable"]];
  if (platform === "ios") return [["wireless", "AirPlay"], ["hdmi", "HDMI cable"]];
  if (platform === "android") return [["wireless", "Google Home"], ["smartview", "Samsung Smart View"], ["hdmi", "HDMI cable"]];
  return [["chrome", "Chrome + Google Cast"], ["hdmi", "HDMI cable"]];
}

const step = (title, text, image, alt) => ({ title, text, image, alt });
const allow = step("Allow the connection on your TV", "If your TV asks, use its remote to choose Allow or Accept. Your screen should now appear on the TV.", "tv-allow", "A television connection request with the Allow button highlighted.");
const code = step("Enter the code from the TV", "If an AirPlay code appears on your TV, enter it on your device. Keep this Karaoke page open while you play.", "tv-code", "A television displaying an example AirPlay code, 4821.");

export function getTVGuide(platform, method) {
  if (method === "hdmi") {
    const mobile = platform === "ios" || platform === "android";
    const sound = platform === "mac" ? "On your Mac, open System Settings → Sound → Output and choose the TV."
      : platform === "windows" ? "On your computer, open Settings → System → Sound → Output and choose the TV or HDMI device."
      : mobile ? "Audio should go to the TV automatically. Turn up the TV volume and keep this page open."
      : "In your computer's Sound settings, choose the TV or HDMI device as the output.";
    return {
      name: "One cable. Picture and sound.",
      labels: ["Plug in", "Input", "Sound"],
      requirement: mobile ? "Your phone or tablet needs a compatible HDMI adapter and support for video output. A normal charging cable will not work." : "Use the computer's HDMI port, or a USB-C to HDMI adapter if that USB-C port supports video.",
      tip: "Using a live microphone? HDMI avoids the extra delay introduced by wireless screen mirroring.",
      source: "https://www.samsung.com/us/support/answer/ANS10003978/",
      steps: [
        step("Connect your device to the TV", "Plug one end into your device and the other into an HDMI IN port on the TV. Remember the port number.", "hdmi-cable", "An HDMI cable connecting a computer to a TV's HDMI 1 input."),
        step("Choose that HDMI input on the TV", platform === "windows" ? "Use the TV remote's Source or Input button. Then press Windows + P on your computer and choose Duplicate." : "Use the TV remote's Source or Input button and choose the HDMI port you connected. If needed, choose screen mirroring in your device's display settings.", "tv-source", "A TV source menu with HDMI 1 highlighted."),
        step("Send the sound to your TV", sound, mobile ? "tv-volume" : "sound-output", "A sound output example with the TV selected."),
      ],
    };
  }
  if (method === "chrome") return {
    name: "Show this Chrome tab on your TV.",
    labels: ["Menu", "Cast tab", "Choose TV"],
    requirement: "Use Chrome on a computer. Your TV needs Google Cast built in, a Chromecast, or a Google TV streaming device. Connect both devices to the same Wi-Fi.",
    tip: "This casts the page. Casting only the YouTube video can leave the Karaoke queue and controls behind.",
    source: "https://support.google.com/chromecast/answer/3228332",
    steps: [
      step("Open Chrome's Cast menu", "In Chrome, click the three dots at the top right. Choose Cast, save, and share → Cast…", "chrome-menu", "Chrome's menu with Cast, save, and share and Cast highlighted."),
      step("Choose Cast tab", "In the Cast panel, open Sources and select Cast tab so the whole Karaoke page appears.", "chrome-source", "Chrome's Cast panel with Sources open and Cast tab selected."),
      step("Choose your TV", "Click the name of your TV. Keep this tab open while everyone plays.", "chrome-devices", "Chrome's Cast panel with an example Living room TV highlighted."),
    ],
  };
  if (platform === "windows") return {
    name: "Your keyboard opens the TV list.",
    labels: ["Keys", "Choose TV", "Allow"],
    requirement: "Turn on Wi-Fi and your TV's Screen Mirroring or Wireless Display mode. Both the PC and TV must support Miracast.",
    tip: "TV missing? Check the TV's mirroring settings. For Chromecast or Google TV, choose Chrome + Google Cast above.",
    source: "https://support.microsoft.com/en-gb/windows/hardware/display-graphics/screen-mirroring-and-projecting-to-your-pc-or-wireless-display",
    steps: [
      { title: "Hold Windows, then press K", text: "Find the Windows logo key near the bottom left of your keyboard. Hold it down and tap K once, then release both keys.", visual: "keys" },
      step("Choose your TV in the Cast panel", "A list appears on your computer. Click your TV's name under Available displays.", "windows-cast", "An illustrated Windows 11 Cast panel with an example Living room TV highlighted."),
      allow,
    ],
  };
  if (platform === "mac") return {
    name: "Use Screen Mirroring on your Mac.",
    labels: ["Menu", "Choose TV", "Code"],
    requirement: "Your TV needs AirPlay support, or an Apple TV connected to it. Put your Mac and TV on the same Wi-Fi.",
    tip: "Can't find the TV? Enable AirPlay in its settings. For a Chromecast or Google TV, choose Chrome + Google Cast above.",
    source: "https://support.apple.com/guide/imac/stream-content-on-a-larger-screen-apdf1417128d/mac",
    steps: [
      step("Open Control Center", "Click the two-switch Control Center icon at the top right of your Mac's menu bar. Choose Screen Mirroring.", "mac-control", "A Mac Control Center example with Screen Mirroring highlighted."),
      step("Choose your TV", "Select the TV from Screen Mirroring. If asked what to share, choose to mirror your screen.", "mac-devices", "A Mac Screen Mirroring menu with an example Living room TV highlighted."),
      code,
    ],
  };
  if (platform === "ios") return {
    name: "Mirror your iPhone or iPad with AirPlay.",
    labels: ["Swipe", "Choose TV", "Code"],
    requirement: "Use an AirPlay-compatible TV or Apple TV. Connect your iPhone or iPad and TV to the same Wi-Fi.",
    tip: "On an iPhone with a Home button, swipe up from the bottom to open Control Center instead.",
    source: "https://support.apple.com/en-us/102661",
    steps: [
      step("Open Control Center", "Swipe down from the top-right corner of the screen. Tap Screen Mirroring—the two overlapping rectangles.", "ios-control", "An iPhone Control Center example with the two-rectangle Screen Mirroring tile highlighted."),
      step("Choose your TV", "Tap your TV's name in the Screen Mirroring list.", "ios-devices", "An iPhone Screen Mirroring list with an example Living room TV highlighted."),
      code,
    ],
  };
  if (method === "smartview") return {
    name: "Use Smart View on a Samsung phone.",
    labels: ["Smart View", "Choose TV", "Allow"],
    requirement: "Use a Samsung Galaxy phone and a compatible screen-mirroring TV. Put both on the same Wi-Fi.",
    tip: "Smart View is a Samsung feature. On other Android phones, use Google Home with a Google Cast-compatible TV.",
    source: "https://www.samsung.com/us/support/answer/ANS10001896/",
    steps: [
      step("Open Quick settings", "Swipe down from the top of the phone twice. Find and tap Smart View; you may need to swipe across the tiles.", "android-smartview", "Samsung Quick settings with Smart View highlighted."),
      step("Choose your TV", "Select your TV in the list, then tap Start now if asked.", "android-devices", "A Smart View device list with an example Living room TV highlighted."),
      allow,
    ],
  };
  return {
    name: "Mirror your Android screen with Google Home.",
    labels: ["Open TV", "Cast", "Allow"],
    requirement: "You need the Google Home app and a TV or streaming device that supports Google Cast. Connect both to the same Wi-Fi.",
    tip: "On a Samsung Galaxy with a mirroring-compatible TV, you can also choose Samsung Smart View above.",
    source: "https://support.google.com/chromecast/answer/6059461",
    steps: [
      step("Open your TV in Google Home", "Open Google Home. Find your TV under Devices or Favorites, then touch and hold its tile.", "android-home", "A Google Home Devices example with a Living room TV tile highlighted."),
      step("Choose Cast my screen", "Tap Cast, then Cast my screen. Confirm Cast screen if asked.", "android-cast", "A Google Home TV control with Cast my screen highlighted."),
      step("Allow screen sharing", "If Android asks, choose Entire screen and Start now. Then return to this Karaoke page.", "android-permission", "An Android screen-sharing permission prompt showing Entire screen and Start now."),
    ],
  };
}
