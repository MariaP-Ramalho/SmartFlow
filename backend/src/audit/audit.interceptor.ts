import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, params, body } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - start;
          this.auditService
            .log({
              caseId: params?.id || params?.caseId || 'system',
              action: 'tool_call',
              actor: 'system',
              details: { method, path, controller: context.getClass().name, handler: context.getHandler().name },
              input: method !== 'GET' ? body : undefined,
              durationMs,
            })
            .catch(() => {});
        },
        error: (error) => {
          const durationMs = Date.now() - start;
          this.auditService
            .log({
              caseId: params?.id || params?.caseId || 'system',
              action: 'error',
              actor: 'system',
              details: { method, path, controller: context.getClass().name, handler: context.getHandler().name },
              input: method !== 'GET' ? body : undefined,
              durationMs,
              error: error.message,
            })
            .catch(() => {});
        },
      }),
    );
  }
}
