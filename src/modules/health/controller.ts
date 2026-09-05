import app from "../../common/express.js";

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check greeting
 *     tags:
 *       - Health
 *     responses:
 *       200:
 *         description: Greeting message
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
app.get("/health", async (req, res) => {
  const data = "Server Up and Running";

  res.send(data);
});
