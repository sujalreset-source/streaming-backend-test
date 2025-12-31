class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
    this.statusCode = 400;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default BadRequestError;