import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@core/security/current-user.decorator';
import { AuthenticatedUser } from '@core/security/jwt-payload';
import { RequirePermissions } from '@core/security/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { ReceptionService } from './reception.service';

@ApiTags('reception')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('reception')
export class ReceptionController {
  constructor(private readonly reception: ReceptionService) {}

  @Get('dashboard')
  @RequirePermissions('reception.dashboard.read')
  dashboard(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    return this.reception.dashboard(user, branchId);
  }
}
