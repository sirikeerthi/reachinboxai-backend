import express from "express";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "../config/swagger.config.js";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import emailQueue from "../config/queue.config.js";
import { basicAuth } from "./auth.middleware.js";

const FRONTEND_URL = process.env.FRONTEND_URL as string;

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", FRONTEND_URL);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const bullBoardServerAdapter = new ExpressAdapter();
bullBoardServerAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: bullBoardServerAdapter,
});

app.use("/admin/queues", basicAuth, bullBoardServerAdapter.getRouter());

export default app;
