import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
    server: {
        // Core
        NODE_ENV: z
            .enum(["development", "test", "production"])
            .default("development"),
        DATABASE_URL: z.string().url(),

        // Better Auth
        BETTER_AUTH_SECRET:
            process.env.NODE_ENV === "production"
                ? z.string()
                : z.string().optional(),
        BETTER_AUTH_GITHUB_CLIENT_ID: z.string(),
        BETTER_AUTH_GITHUB_CLIENT_SECRET: z.string(),

        // AI Provider — Groq via OpenAI-compatible API
        OPENAI_API_KEY: z.string(),
        OPENAI_BASE_URL: z.string().url().default("https://api.groq.com/openai/v1"),
        GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

        // Voice (E2 — optional)
        ELEVENLABS_API_KEY: z.string().optional(),
        WHISPER_API_KEY: z.string().optional(),

        // External Tool APIs (E4 — optional)
        WEATHER_API_KEY: z.string().optional(),
        SERP_API_KEY: z.string().optional(),

        // Background Jobs (E5 — optional)
        REDIS_URL: z.string().url().optional(),
    },

    client: {
        NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    },

    runtimeEnv: {
        // Core
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,

        // Better Auth
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_GITHUB_CLIENT_ID: process.env.BETTER_AUTH_GITHUB_CLIENT_ID,
        BETTER_AUTH_GITHUB_CLIENT_SECRET: process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET,

        // AI
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
        GROQ_MODEL: process.env.GROQ_MODEL,

        // Voice
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        WHISPER_API_KEY: process.env.WHISPER_API_KEY,

        // External Tools
        WEATHER_API_KEY: process.env.WEATHER_API_KEY,
        SERP_API_KEY: process.env.SERP_API_KEY,

        // Jobs
        REDIS_URL: process.env.REDIS_URL,

        // App
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },

    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});