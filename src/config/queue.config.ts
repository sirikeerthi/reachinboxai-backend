import { Queue } from "bullmq";
import redisClient from "./redis.config.js";

const emailQueue = new Queue("email", {
  connection: redisClient,
});

export default emailQueue;
