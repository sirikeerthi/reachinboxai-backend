import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { verifyJwt } from "./jwt.js";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authorization token is required",
    });
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = verifyJwt(token);
    req.id = payload.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

export function basicAuth(req: Request, res: Response, next: NextFunction) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return res.status(500).send("Admin credentials are not configured");
  }

  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(
      authHeader.slice("Basic ".length),
      "base64",
    ).toString("utf8");

    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (
      separatorIndex !== -1 &&
      safeEqual(user, expectedUser) &&
      safeEqual(password, expectedPassword)
    ) {
      return next();
    }
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="Admin", charset="UTF-8"');

  return res.status(401).send("Authentication required");
}
