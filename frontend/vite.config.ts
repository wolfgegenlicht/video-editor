import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import http from "node:http";

function backendProxy() {
  return {
    name: "backend-proxy",
    enforce: "pre" as const,
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const API_PATHS = ["/upload", "/files", "/transcribe", "/export", "/projects", "/eye-contact"];
        const matches = API_PATHS.some(
          (p) => req.url === p || req.url?.startsWith(p + "/") || req.url?.startsWith(p + "?")
        );
        if (!matches) return next();

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks);
          const headers = { ...req.headers };
          delete headers["expect"];
          delete headers["connection"];
          headers["content-length"] = String(body.length);

          const proxyReq = http.request(
            { hostname: "localhost", port: 8000, path: req.url, method: req.method, headers },
            (proxyRes) => {
              res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
              proxyRes.pipe(res);
            }
          );
          proxyReq.on("error", () => {
            res.writeHead(502);
            res.end("Backend unavailable");
          });
          proxyReq.write(body);
          proxyReq.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [backendProxy(), react(), tailwindcss()],
});
