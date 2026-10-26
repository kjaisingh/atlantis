export class SearchError extends Error {
  constructor(message, { status = 502, code = 'search_failed', resetAt } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.resetAt = resetAt;
  }
}
