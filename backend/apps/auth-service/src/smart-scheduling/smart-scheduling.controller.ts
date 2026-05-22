import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@core/common/zod-validation.pipe';
import { CurrentUser } from '@core/security/current-user.decorator';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { RequirePermissions } from '@core/security/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import {
  AppointmentListQuery,
  CreateAppointmentDto,
  ReserveSlotDto,
  UpdateAppointmentDto,
  appointmentListQuerySchema,
  createAppointmentSchema,
  reserveSlotSchema,
  updateAppointmentSchema
} from './dto/appointment.schemas';
import { SmartSchedulingService } from './smart-scheduling.service';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller()
export class SmartSchedulingController {
  constructor(private readonly scheduling: SmartSchedulingService) {}

  @Get('appointments')
  @RequirePermissions('scheduling.appointments.read')
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(appointmentListQuerySchema)) query: AppointmentListQuery) {
    return this.scheduling.list(user, query);
  }

  @Post('appointments')
  @RequirePermissions('scheduling.appointments.create')
  @UsePipes(new ZodValidationPipe(createAppointmentSchema))
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAppointmentDto) {
    return this.scheduling.create(user, dto);
  }

  @Patch('appointments/:id')
  @RequirePermissions('scheduling.appointments.update')
  @UsePipes(new ZodValidationPipe(updateAppointmentSchema))
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.scheduling.update(user, id, dto);
  }

  @Post('appointments/:id/confirm')
  @RequirePermissions('scheduling.appointments.update')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scheduling.transition(user, id, 'CONFIRMED');
  }

  @Post('appointments/:id/check-in')
  @RequirePermissions('reception.visit.checkin')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scheduling.transition(user, id, 'CHECKED_IN');
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('scheduling.appointments.cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.scheduling.transition(user, id, 'CANCELLED', body.reason);
  }

  @Get('availability')
  @RequirePermissions('scheduling.availability.read')
  availability(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(appointmentListQuerySchema)) query: AppointmentListQuery) {
    return this.scheduling.availability(user, query);
  }

  @Post('slots/reserve')
  @RequirePermissions('scheduling.appointments.create')
  @UsePipes(new ZodValidationPipe(reserveSlotSchema))
  reserve(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReserveSlotDto) {
    return this.scheduling.reserveSlot(user, dto);
  }

  @Get('services')
  @RequirePermissions('scheduling.availability.read')
  services(@CurrentUser() user: AuthenticatedUser) {
    return this.scheduling.services(user);
  }

  @Get('doctors')
  @RequirePermissions('scheduling.availability.read')
  doctors(@CurrentUser() user: AuthenticatedUser) {
    return this.scheduling.doctors(user);
  }
}

