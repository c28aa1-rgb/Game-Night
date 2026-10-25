// Runs Karaoke on its own: `npm run build && npm start`, then open http://<this-computer>:3000/karaoke/
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { createKaraoke } from "./karaoke.mjs";

const port = Number(process.env.PORT || 3000);
const karaoke = createKaraoke({ staticDir: join(process.cwd(), "dist") });

createServer(async (req, res) => {
  if (await karaoke.handle(req, res)) return;
  res.writeHead(302, { Location: "/karaoke/" });
  res.end();
}).listen(port, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address;
  console.log(`Karaoke on http://localhost:${port}/karaoke/${lan ? `  (phones on this Wi-Fi: http://${lan}:${port}/karaoke/)` : ""}`);
});
