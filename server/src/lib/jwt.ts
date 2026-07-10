import jwt from "jsonwebtoken";
import { config } from "../config.js";

type AuthPayload = {
  sub: string;
  email: string;
};

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    issuer: "smailpro-inbox",
    audience: "smailpro-web"
  });
}

export function verifyAuthToken(token: string): AuthPayload {
  const payload = jwt.verify(token, config.JWT_SECRET, {
    issuer: "smailpro-inbox",
    audience: "smailpro-web"
  });
  if (typeof payload === "string" || !payload.sub || typeof payload.email !== "string") {
    throw new Error("Invalid authentication token");
  }
  return { sub: payload.sub, email: payload.email };
}
