import app from "../../common/express.js";
import AuthService from "./service.js";
import { authenticate } from "../../common/auth.middleware.js";

const FRONTEND_URL = process.env.FRONTEND_URL as string;

/**
 * @openapi
 * /auth/google:
 *   get:
 *     summary: Start Google OAuth login/signup
 *     tags:
 *       - Auth
 *     responses:
 *       302:
 *         description: Redirects to Google's OAuth consent screen
 */
app.get("/auth/google", async (req, res) => {
  res.redirect(AuthService.getGoogleAuthUrl());
});

/**
 * @openapi
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback - creates or logs in the user, issues a JWT, and redirects to the frontend
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirects to FRONTEND_URL/auth/callback with the token (or an error) in the query string
 */
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.redirect(
      `${FRONTEND_URL}/auth/callback?error=${encodeURIComponent("'code' is required")}`,
    );
  }

  try {
    const { token } = await AuthService.googleLogin(code);

    return res.redirect(
      `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`,
    );
  } catch (error) {
    console.error("Google login failed:", error);

    return res.redirect(
      `${FRONTEND_URL}/auth/callback?error=${encodeURIComponent("Google login failed")}`,
    );
  }
});

/**
 * @openapi
 * /api/me:
 *   get:
 *     summary: Get the authenticated user's profile and Slack connection status
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *       401:
 *         description: Missing or invalid JWT
 *       500:
 *         description: Failed to retrieve profile
 */
app.get("/api/me", authenticate, async (req, res) => {
  try {
    const data = await AuthService.getMe(req.id!);

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Failed to retrieve profile:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve profile",
    });
  }
});

/**
 * @openapi
 * /auth/slack/connect:
 *   get:
 *     summary: Get the Slack OAuth authorize URL for the authenticated user
 *     description: >
 *       Returns the URL instead of redirecting, since a plain browser navigation to this
 *       route can't carry the Bearer JWT (it lives in the frontend's localStorage, not a
 *       cookie). The frontend fetches this with the token attached, then navigates the
 *       browser to the returned URL itself.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Slack authorize URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *       401:
 *         description: Missing or invalid JWT
 */
app.get("/auth/slack/connect", authenticate, async (req, res) => {
  const url = AuthService.getSlackAuthUrl(req.id!);

  return res.status(200).json({
    success: true,
    message: "Slack authorize URL generated",
    data: { url },
  });
});

/**
 * @openapi
 * /auth/slack/callback:
 *   get:
 *     summary: Slack OAuth callback - exchanges the code, stores the connection, and redirects to the frontend
 *     tags:
 *       - Auth
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirects to FRONTEND_URL/dashboard with a slack=connected|error query param
 */
app.get("/auth/slack/callback", async (req, res) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/dashboard?slack=error`);
  }

  try {
    await AuthService.connectSlack(code, state);

    return res.redirect(`${FRONTEND_URL}/dashboard?slack=connected`);
  } catch (error) {
    console.error("Slack connection failed:", error);

    return res.redirect(`${FRONTEND_URL}/dashboard?slack=error`);
  }
});

/**
 * @openapi
 * /auth/slack:
 *   delete:
 *     summary: Disconnect the authenticated user's Slack connection
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Slack disconnected successfully
 *       401:
 *         description: Missing or invalid JWT
 *       500:
 *         description: Slack disconnection failed
 */
app.delete("/auth/slack", authenticate, async (req, res) => {
  try {
    await AuthService.disconnectSlack(req.id!);

    return res.status(200).json({
      success: true,
      message: "Slack disconnected successfully",
    });
  } catch (error) {
    console.error("Slack disconnection failed:", error);

    return res.status(500).json({
      success: false,
      message: "Slack disconnection failed",
    });
  }
});
