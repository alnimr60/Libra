import Fastify from "fastify";
import middie from "@fastify/middie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { searchRoutes } from "./src/server/routes";

async function startServer() {
  const fastify = Fastify({ logger: true });
  const PORT = 3000;

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(500).send({ 
      error: "Internal Server Error", 
      message: error.message,
      path: request.url
    });
  });

  // Plugins
  await fastify.register(cors, {
    origin: true, // Allow all origins in standalone mode
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
  });
  await fastify.register(rateLimit, {
    max: 200, // Slightly more relaxed for standalone
    timeWindow: "1 minute",
  });
  await fastify.register(middie);

  // API Routes
  fastify.addHook('onRequest', async (req, reply) => {
    console.log(`[FASTIFY_MAIN_REQUEST] ${req.method} ${req.url}`);
  });

  await fastify.register(async (fastify) => {
    fastify.addHook('onRequest', async (req, reply) => {
      console.log(`[FASTIFY_API_REQUEST] ${req.method} ${req.url}`);
    });
    await fastify.register(searchRoutes);
  }, { prefix: "/api" });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    fastify.use((req: any, res: any, next: any) => {
      if (req.url.startsWith("/api")) {
        next();
      } else {
        vite.middlewares(req, res, next);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");

    if (fs.existsSync(distPath)) {
      fastify.register(import("@fastify/static"), {
        root: distPath,
        wildcard: false,
      });

      fastify.setNotFoundHandler((req, reply) => {
        if (req.url.startsWith('/api')) {
          reply.code(404).send({ error: 'Not Found' });
        } else {
          reply.sendFile('index.html');
        }
      });
    }
  }

  try {
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
