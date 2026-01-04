import { logger } from "./logger";

export class ServiceUnavailableError extends Error {
  constructor(serviceName: string) {
    super(`Service unavailable: ${serviceName} circuit is OPEN`);
    this.name = "ServiceUnavailableError";
  }
}

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeout?: number;
}

export class CircuitBreaker {
  private name: string;
  private state: CircuitState = "CLOSED";
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private failureThreshold: number;
  private resetTimeout: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeout = options.resetTimeout ?? 30000;

    logger.info(`[CIRCUIT] Circuit Breaker Initialized: ${this.name}`, {
      failureThreshold: this.failureThreshold,
      resetTimeout: this.resetTimeout,
    });
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const now = Date.now();
      const elapsed = now - this.lastFailureTime;

      if (elapsed >= this.resetTimeout) {
        this.state = "HALF_OPEN";
        logger.info(`[CIRCUIT] ${this.name} transitioned to HALF_OPEN (testing recovery)`, {
          elapsedMs: elapsed,
        });
      } else {
        throw new ServiceUnavailableError(this.name);
      }
    }

    try {
      const result = await fn();

      if (this.state === "HALF_OPEN") {
        this.reset();
        logger.info(`[CIRCUIT] ${this.name} recovered - transitioned to CLOSED`, {
          previousFailures: this.failures,
        });
      }

      this.failures = 0;
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn(`[CIRCUIT] ${this.name} failure recorded`, {
      failures: this.failures,
      threshold: this.failureThreshold,
      state: this.state,
    });

    if (this.failures >= this.failureThreshold && this.state !== "OPEN") {
      this.state = "OPEN";
      logger.error(`[CIRCUIT] ${this.name} transitioned to OPEN (failing fast)`, {
        failures: this.failures,
        resetTimeoutMs: this.resetTimeout,
      });
    }
  }

  private reset(): void {
    this.state = "CLOSED";
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }
}

export const stripeCircuitBreaker = new CircuitBreaker({
  name: "Stripe",
  failureThreshold: 5,
  resetTimeout: 30000,
});

export const mailerCircuitBreaker = new CircuitBreaker({
  name: "Mailer",
  failureThreshold: 5,
  resetTimeout: 30000,
});
