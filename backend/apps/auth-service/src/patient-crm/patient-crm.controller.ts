import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@core/common/zod-validation.pipe';
import { CurrentUser } from '@core/security/current-user.decorator';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { RequirePermissions } from '@core/security/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { PatientCrmService } from './patient-crm.service';
import {
  CreatePatientDto,
  PatientListQuery,
  UpdatePatientDto,
  createPatientSchema,
  patientListQuerySchema,
  updatePatientSchema
} from './dto/patient.schemas';

@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('patients')
export class PatientCrmController {
  constructor(private readonly patients: PatientCrmService) {}

  @Get()
  @RequirePermissions('patients.read')
  @ApiOperation({ summary: 'List patients with pagination and branch-aware filtering' })
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(patientListQuerySchema)) query: PatientListQuery) {
    return this.patients.list(user, query);
  }

  @Get('search')
  @RequirePermissions('patients.read')
  @ApiOperation({ summary: 'Search patients and return duplicate candidates baseline' })
  search(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(patientListQuerySchema)) query: PatientListQuery) {
    return this.patients.search(user, query);
  }

  @Post()
  @RequirePermissions('patients.create')
  @UsePipes(new ZodValidationPipe(createPatientSchema))
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePatientDto) {
    return this.patients.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('patients.read')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patients.get(user, id);
  }

  @Patch(':id')
  @RequirePermissions('patients.update')
  @UsePipes(new ZodValidationPipe(updatePatientSchema))
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(user, id, dto);
  }
}

