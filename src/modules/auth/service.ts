import dataSource from "../../config/db.config.js";
import { User } from "../../entities/user.entity.js";
import { SlackConnections } from "../../entities/slack.connections.entity.js";
import { signJwt, verifyJwt } from "../../common/jwt.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID as string;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET as string;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL as string;

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID as string;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET as string;
const SLACK_CALLBACK_URL = process.env.SLACK_CALLBACK_URL as string;

interface GoogleTokenResponse {
  access_token: string;
}

interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture: string;
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  team: { id: string };
  authed_user: { id: string };
}

class AuthService {
  getGoogleAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_CALLBACK_URL,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async googleLogin(code: string) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URL,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      throw new Error("Failed to exchange Google authorization code");
    }

    const tokens = (await tokenRes.json()) as GoogleTokenResponse;

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );

    if (!profileRes.ok) {
      throw new Error("Failed to fetch Google user profile");
    }

    const profile = (await profileRes.json()) as GoogleUserInfo;

    const userRepo = dataSource.getRepository(User);

    let user = await userRepo.findOne({ where: { googleId: profile.sub } });

    if (!user) {
      user = await userRepo.save(
        userRepo.create({
          googleId: profile.sub,
          email: profile.email,
          name: profile.name,
          avatorUrl: profile.picture,
        }),
      );
    }

    const token = signJwt({ userId: user.id });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatorUrl: user.avatorUrl,
      },
    };
  }

  getSlackAuthUrl(userId: number): string {
    const state = signJwt({ userId }, "10m");

    const params = new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      scope: "chat:write,im:write",
      redirect_uri: SLACK_CALLBACK_URL,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  async connectSlack(code: string, state: string) {
    const { userId } = verifyJwt(state);

    const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: SLACK_CLIENT_ID,
        client_secret: SLACK_CLIENT_SECRET,
        redirect_uri: SLACK_CALLBACK_URL,
      }),
    });

    const slackData = (await tokenRes.json()) as SlackOAuthResponse;

    if (!slackData.ok) {
      throw new Error(slackData.error || "Slack OAuth exchange failed");
    }

    const slackRepo = dataSource.getRepository(SlackConnections);

    let connection = await slackRepo.findOne({ where: { user_id: userId } });

    if (connection) {
      connection.access_token = slackData.access_token;
      connection.team_id = slackData.team.id;
      connection.slack_user_id = slackData.authed_user.id;
    } else {
      connection = slackRepo.create({
        user_id: userId,
        access_token: slackData.access_token,
        team_id: slackData.team.id,
        slack_user_id: slackData.authed_user.id,
      });
    }

    return slackRepo.save(connection);
  }

  async getMe(userId: number) {
    const userRepo = dataSource.getRepository(User);
    const slackRepo = dataSource.getRepository(SlackConnections);

    const user = await userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error("User not found");
    }

    const slackConnection = await slackRepo.findOne({
      where: { user_id: userId },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatorUrl: user.avatorUrl,
      slackConnected: !!slackConnection,
    };
  }

  async disconnectSlack(userId: number) {
    const slackRepo = dataSource.getRepository(SlackConnections);

    const result = await slackRepo.delete({ user_id: userId });

    if (result.affected === 0) {
      throw new Error("No Slack connection found for this user");
    }
  }
}

export default new AuthService();
