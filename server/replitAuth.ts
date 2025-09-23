import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  const user = await storage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });

  // Check if user has an organization, create one if they don't
  const existingOrg = await storage.getUserOrganization(user.id);
  if (!existingOrg) {
    const orgName = user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}'s Properties`
      : user.email 
        ? `${user.email}'s Properties`
        : "My Properties";
    
    await storage.createOrganization({
      name: orgName,
      ownerId: user.id,
    });
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    console.log("🔑 OAuth verify callback called");
    console.log("🔑 Token claims:", tokens.claims());
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    console.log("🔑 User session after update:", user);
    verified(null, user);
  };

  for (const domain of process.env
    .REPLIT_DOMAINS!.split(",")) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    console.log("🔄 OAuth callback called");
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });

  // Update user profile
  const updateProfileSchema = {
    firstName: (val: any) => typeof val === "string" && val.length > 0 ? null : "First name is required",
    lastName: (val: any) => typeof val === "string" && val.length > 0 ? null : "Last name is required", 
    email: (val: any) => typeof val === "string" && val.includes("@") ? null : "Please enter a valid email address",
    phone: (val: any) => val === undefined || typeof val === "string" ? null : "Phone must be a string",
    bio: (val: any) => val === undefined || typeof val === "string" ? null : "Bio must be a string",
  };

  app.patch("/api/auth/user/profile", isAuthenticated, async (req, res) => {
    try {
      const { firstName, lastName, email, phone, bio } = req.body;
      
      // Simple validation
      const errors: string[] = [];
      if (!firstName || firstName.length === 0) errors.push("First name is required");
      if (!lastName || lastName.length === 0) errors.push("Last name is required");  
      if (!email || !email.includes("@")) errors.push("Please enter a valid email address");
      
      if (errors.length > 0) {
        return res.status(400).json({ message: "Validation failed", errors });
      }

      const userClaims = req.user as any;
      const updatedUser = await storage.upsertUser({
        id: userClaims.claims.sub,
        firstName,
        lastName,
        email,
        phone: phone || null,
        bio: bio || null,
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
