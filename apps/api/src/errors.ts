const definitions = {
  INVALID_REQUEST: [400, 'Invalid request.', false],
  REQUEST_TOO_LARGE: [413, 'Request body is too large.', false],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Use application/json.', false],
  NOT_FOUND: [404, 'Resource not found in the selected publication.', false],
  NO_PUBLICATION: [
    503,
    'No schedule is activated for this service date.',
    false,
  ],
  WALKING_NOT_CONFIGURED: [
    503,
    'Journey walking capability is not configured.',
    false,
  ],
  WALKING_UNAVAILABLE: [
    503,
    'Walking service is temporarily unavailable.',
    true,
  ],
  WALKING_TIMEOUT: [504, 'Walking service timed out.', true],
  PUBLICATION_CHANGED: [
    503,
    'Schedule changed during preparation. Retry the request.',
    true,
  ],
  DATABASE_UNAVAILABLE: [
    503,
    'Schedule storage is temporarily unavailable.',
    true,
  ],
  SERVICE_UNAVAILABLE: [503, 'Service is shutting down.', true],
  SERVER_BUSY: [
    503,
    'Service capacity is currently occupied. Retry later.',
    true,
  ],
  REQUEST_TIMEOUT: [504, 'Request deadline exceeded.', true],
  REQUEST_CANCELED: [499, 'Request canceled.', false],
  INTERNAL_ERROR: [500, 'Unable to complete the request.', false],
} as const;
export type ErrorCode = keyof typeof definitions;

export class ApiError extends Error {
  constructor(readonly code: ErrorCode) {
    super(definitions[code][1]);
  }
  get statusCode() {
    return definitions[this.code][0];
  }
  body(requestId: string) {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: definitions[this.code][2],
      },
      requestId,
    };
  }
}
