/**
 * Error envelope. The brief pins the shape to `{error:{code,message,details}}`
 * (a wrapped variant of the docs/09 §4 taxonomy). Zod validation failures →
 * 400 with the stable machine `code` and the flattened issues in `details`.
 */
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorBody(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export function zodErrorBody(code: string, err: ZodError): ApiErrorBody {
  return errorBody(code, "Request body failed schema validation.", err.flatten());
}
