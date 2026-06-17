import cors from "cors";
import express from "express";

import {
  ProfileConflictError,
  ProfileNotFoundError,
  ProfileStorageError,
  ProfileValidationError,
} from "./profile.errors.js";
import { createProfileService } from "./profile.service.js";
import { createMappingService } from "./mapping.service.js";

const DEFAULT_ALLOWED_ORIGINS = [
  /^chrome-extension:\/\//,
  /^http:\/\/localhost(?::\d+)?$/,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/,
];

function isOriginAllowed(origin, configuredOrigin) {
  if (!origin) {
    return true;
  }

  if (configuredOrigin && origin === configuredOrigin) {
    return true;
  }

  return DEFAULT_ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

export function createApp({
  extensionOrigin = process.env.EXTENSION_ORIGIN,
  profileService = createProfileService(),
  mappingService,
} = {}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin, extensionOrigin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin is not allowed by CORS"));
      },
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "form-auto-fill-backend",
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    });
  });

  app.get("/api/profile", async (_request, response) => {
    const profile = await profileService.get();
    response.json({ profile });
  });

  app.put("/api/profile", async (request, response) => {
    const { profile, expectedRevision } = request.body ?? {};
    const savedProfile = await profileService.save(profile, expectedRevision);
    response.json({ profile: savedProfile });
  });

  app.post("/api/v1/match", async (request, response) => {
    const { questions } = request.body ?? {};

    if (!Array.isArray(questions) || questions.length === 0) {
      return response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "questions must be a non-empty array",
        },
      });
    }

    if (questions.length > 100) {
      return response.status(400).json({
        error: {
          code: "REQUEST_TOO_LARGE",
          message: "Maximum 100 questions per request",
        },
      });
    }

    // Validate each question has required fields
    for (const question of questions) {
      if (!question?.id || !question?.text) {
        return response.status(400).json({
          error: {
            code: "INVALID_QUESTION",
            message: `Each question must have id and text (failed at question: ${question?.id})`,
          },
        });
      }
    }

    try {
      const profile = await profileService.get();
      const ms =
        mappingService || createMappingService({ profileService });

      const matches = await ms.matchQuestions(questions, profile);

      return response.json({ matches });
    } catch (error) {
      if (error instanceof ProfileNotFoundError) {
        return response.status(404).json({
          error: {
            code: "PROFILE_NOT_FOUND",
            message: "Profile not found. Create a profile first.",
          },
        });
      }

      console.error("Matching error:", error.message);
      return response.status(500).json({
        error: {
          code: "MATCHING_ERROR",
          message: "Failed to match questions",
        },
      });
    }
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  app.use((error, _request, response, _next) => {
    const isJsonError = error instanceof SyntaxError && "body" in error;
    let status = isJsonError ? 400 : 500;
    let code = isJsonError ? "INVALID_JSON" : "INTERNAL_ERROR";
    let message = isJsonError
      ? "Request body contains invalid JSON"
      : "Unexpected server error";
    let details;

    if (error instanceof ProfileNotFoundError) {
      status = 404;
      code = "PROFILE_NOT_FOUND";
      message = "Profile not found";
    } else if (error instanceof ProfileValidationError) {
      status = 400;
      code = "PROFILE_INVALID";
      message = "Profile validation failed";
      details = error.details;
    } else if (error instanceof ProfileConflictError) {
      status = 409;
      code = "PROFILE_CONFLICT";
      message = "Profile was changed on the server";
      details = { profile: error.profile };
    } else if (error instanceof ProfileStorageError) {
      status = 500;
      code = "PROFILE_STORAGE_ERROR";
      message = "Profile storage is unavailable";
    }

    if (status === 500) {
      console.error("Unhandled backend error:", error.message);
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    });
  });

  return app;
}
