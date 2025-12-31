// errors/ForbiddenError.js
import { StatusCodes } from "http-status-codes";

export class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = StatusCodes.FORBIDDEN; // 403
  }
}