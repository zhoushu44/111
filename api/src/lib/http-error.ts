export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = status) {
    super(message);
  }
}
