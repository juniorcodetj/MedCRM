import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<TInput, TOutput> implements PipeTransform<TInput, TOutput> {
  constructor(private readonly schema: ZodSchema<TOutput>) {}

  transform(value: TInput): TOutput {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues
      });
    }
    return result.data;
  }
}

