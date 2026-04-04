import type { OpenDispatchHttpConfig } from "../../../config";

export interface OpenDispatchTranscriptIngressRequest {
  source: string;
  conversationKey: string;
  dedupeKey: string;
  text: string;
  identity: {
    sourceScopeId: string;
    eventId: string;
    conversationScopeId: string;
    conversationId: string;
    threadId?: string;
    dedupeScopeId: string;
    dedupeUnitId: string;
    dedupeVariantId?: string;
    messageId?: string;
    fileId?: string;
  };
  routing: {
    mode: "canonical-transcript";
    language?: string;
  };
}

export interface OpenDispatchIngressApiClient {
  postTranscript(request: OpenDispatchTranscriptIngressRequest): Promise<void>;
}

export class OpenDispatchHttpError extends Error {
  readonly code: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
    }
  ) {
    super(message);
    this.name = "OpenDispatchHttpError";
    this.code = code;
    this.status = options?.status;
    this.retryable = options?.retryable ?? true;
  }
}

const buildIngressUrl = (config: OpenDispatchHttpConfig): string => {
  if (!config.baseUrl) {
    throw new Error("Open Dispatch HTTP config requires baseUrl");
  }

  return new URL(config.endpointPath, `${config.baseUrl}/`).toString();
};

const classifyHttpStatus = (status: number): { code: string; retryable: boolean } => {
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    return {
      code: "opendispatch_http_retryable_response",
      retryable: true,
    };
  }

  return {
    code: "opendispatch_http_contract_error",
    retryable: false,
  };
};

export const createOpenDispatchIngressApiClient = (
  config: OpenDispatchHttpConfig
): OpenDispatchIngressApiClient => {
  const endpointUrl = buildIngressUrl(config);

  return {
    async postTranscript(request) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), config.timeoutMs);

      try {
        const response = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.authToken ? { authorization: `Bearer ${config.authToken}` } : {}),
          },
          body: JSON.stringify(request),
          signal: abortController.signal,
        });

        if (response.ok) {
          return;
        }

        const classification = classifyHttpStatus(response.status);
        throw new OpenDispatchHttpError(
          classification.code,
          `Open Dispatch transcript ingress failed with status ${response.status}`,
          {
            status: response.status,
            retryable: classification.retryable,
          }
        );
      } catch (error) {
        if (error instanceof OpenDispatchHttpError) {
          throw error;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          throw new OpenDispatchHttpError(
            "opendispatch_http_timeout",
            `Open Dispatch transcript ingress timed out after ${config.timeoutMs}ms`,
            { retryable: true }
          );
        }

        if (error instanceof Error) {
          throw new OpenDispatchHttpError(
            "opendispatch_http_transport_error",
            `Open Dispatch transcript ingress transport failed: ${error.message}`,
            { retryable: true }
          );
        }

        throw new OpenDispatchHttpError(
          "opendispatch_http_transport_error",
          "Open Dispatch transcript ingress transport failed",
          { retryable: true }
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
