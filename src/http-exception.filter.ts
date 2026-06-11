import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;

    let error: string;
    let detalle: string;

    if (raw && typeof raw === 'object' && 'error' in raw && 'detalle' in raw) {
      error = (raw as any).error;
      detalle = (raw as any).detalle;
    } else if (raw && typeof raw === 'object' && 'message' in raw) {
      error = httpStatusLabel(status);
      detalle = Array.isArray((raw as any).message)
        ? (raw as any).message.join(', ')
        : String((raw as any).message);
    } else if (typeof raw === 'string') {
      error = httpStatusLabel(status);
      detalle = raw;
    } else {
      error = 'Error interno';
      detalle = 'Ocurrio un error inesperado';
    }

    response.status(status).json({ error, detalle });
  }
}

const httpStatusLabel = (status: number): string => {
  const labels: Record<number, string> = {
    400: 'Solicitud invalida',
    404: 'No encontrado',
    409: 'Conflicto',
    422: 'Entidad no procesable',
    500: 'Error interno del servidor',
  };
  return labels[status] ?? `Error ${status}`;
};
