import { SetMetadata } from '@nestjs/common';

export const REQUIRED_MODULE_KEY = 'required_module';

export const RequireModule = (moduleCode: string) => SetMetadata(REQUIRED_MODULE_KEY, moduleCode);
