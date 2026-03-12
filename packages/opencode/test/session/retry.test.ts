import { describe, expect, test } from "bun:test"
import { SessionRetry } from "../../src/session/retry"
import { MessageV2 } from "../../src/session/message-v2"

describe("SessionRetry.retryable", () => {
  test("recognizes Anthropic rate limit error with nested structure", () => {
    const error = {
      name: "APIError",
      data: {
        message: "This request would exceed your account's rate limit. Please try again later.",
        isRetryable: true,
        responseBody: JSON.stringify({
          type: "error",
          error: {
            type: "rate_limit_error",
            message: "This request would exceed your account's rate limit. Please try again later."
          }
        })
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBeDefined()
    expect(result).toContain("rate limit")
  })

  test("recognizes OpenAI rate limit error with too_many_requests type", () => {
    const error = {
      name: "APIError",
      data: {
        message: "Rate limit reached",
        isRetryable: true,
        responseBody: JSON.stringify({
          error: {
            type: "too_many_requests"
          }
        })
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBeDefined()
    // For APIError, it returns the message directly
    expect(result).toBe("Rate limit reached")
  })

  test("recognizes quota exceeded error", () => {
    const error = {
      name: "APIError",
      data: {
        message: "Weekly/Monthly Limit Exhausted",
        isRetryable: true
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBeDefined()
    expect(result.toLowerCase()).toContain("exhausted")
  })

  test("returns undefined for non-retryable errors", () => {
    const error = {
      name: "APIError",
      data: {
        message: "Invalid API key",
        isRetryable: false
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBeUndefined()
  })

  test("handles ContextOverflowError", () => {
    const error = MessageV2.ContextOverflowError.create({
      message: "Context window exceeded"
    })

    const result = SessionRetry.retryable(error)
    expect(result).toBeUndefined()
  })

  test("handles overloaded provider", () => {
    const error = {
      name: "APIError",
      data: {
        message: "Provider is Overloaded",
        isRetryable: true
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBe("Provider is overloaded")
  })

  test("handles nested error structure from JSON", () => {
    const error = {
      name: "APIError",
      data: {
        message: JSON.stringify({
          error: {
            type: "rate_limit_error",
            message: "Rate limited"
          }
        }),
        isRetryable: true
      }
    }

    const result = SessionRetry.retryable(error as any)
    expect(result).toBeDefined()
  })
})

describe("SessionRetry.delay", () => {
  test("uses retry-after header in milliseconds", () => {
    const error = {
      data: {
        responseHeaders: {
          "retry-after-ms": "5000"
        }
      }
    } as any

    const delay = SessionRetry.delay(1, error)
    expect(delay).toBe(5000)
  })

  test("uses retry-after header in seconds", () => {
    const error = {
      data: {
        responseHeaders: {
          "retry-after": "120"
        }
      }
    } as any

    const delay = SessionRetry.delay(1, error)
    expect(delay).toBe(120000)
  })

  test("uses exponential backoff without headers", () => {
    const delay1 = SessionRetry.delay(1)
    const delay2 = SessionRetry.delay(2)
    
    expect(delay2).toBeGreaterThan(delay1)
  })

  test("caps delay at RETRY_MAX_DELAY_NO_HEADERS", () => {
    const delay = SessionRetry.delay(100)
    expect(delay).toBeLessThanOrEqual(30000)
  })
})
