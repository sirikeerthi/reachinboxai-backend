import "reflect-metadata";
import dataSource from "./config/db.config.js";
import redisClient from "./config/redis.config.js";
import { ensureEmailsIndex } from "./config/elasticsearch.config.js";
import "./modules/auth/controller.js";
import "./modules/email/controller.js";
import "./modules/email/queue.js";
import "./modules/health/controller.js";

dataSource
  .initialize()
  .then(() => {
    console.log("Database connected successfully");
  })
  .catch((error) => {
    console.error("Error connecting to the database", error);
  });

ensureEmailsIndex()
  .then(() => {
    console.log("Elasticsearch emails index ready");
  })
  .catch((error) => {
    console.error("Error initializing Elasticsearch index:", error);
  });

redisClient.on("connect", () => {
  console.log("Connected to Redis");
});

redisClient.on("error", (error) => {
  console.error("Redis connection error:", error);
});
