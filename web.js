import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const HOST = "0.0.0.0";

const server = http.createServer((_req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end("AterBot Bedrock is running.\n");
});

export function startWeb() {
  server.listen(PORT, HOST, () => {
    console.log(`Health server listening on ${HOST}:${PORT}`);
  });
}
