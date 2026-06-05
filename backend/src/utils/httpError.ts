export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (entity = 'Recurso') => new HttpError(404, `${entity} no encontrado`);
