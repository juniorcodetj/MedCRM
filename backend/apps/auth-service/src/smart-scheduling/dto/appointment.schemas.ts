import { z } from 'zod';

export const appointmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  branchId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional()
});

export const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  patientId: z.string().uuid(),
  employeeId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  bookingSource: z.enum(['ADMIN_PANEL', 'ONLINE_WIDGET', 'TELEGRAM_BOT', 'WHATSAPP', 'PHONE_CALL', 'WALK_IN', 'API']).default('ADMIN_PANEL'),
  appointmentType: z.enum(['CONSULTATION', 'PROCEDURE', 'FOLLOW_UP', 'ONLINE_CONSULTATION', 'LAB_VISIT', 'DIAGNOSTIC']).default('CONSULTATION'),
  notes: z.string().max(2000).optional()
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED']).optional(),
  cancellationReason: z.string().max(1000).optional()
});

export const reserveSlotSchema = z.object({
  branchId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime()
});

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentDto = z.infer<typeof updateAppointmentSchema>;
export type ReserveSlotDto = z.infer<typeof reserveSlotSchema>;

