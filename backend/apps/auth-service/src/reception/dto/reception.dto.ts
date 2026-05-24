import { z } from 'zod';

export const CheckInSchema = z.object({
  appointmentId: z.string().uuid(),
  priority: z.enum(['NORMAL', 'URGENT', 'VIP']).default('NORMAL'),
});
export type CheckInDto = z.infer<typeof CheckInSchema>;

export const FastBookingSchema = z.object({
  phone: z.string().min(5).max(40),
  firstName: z.string().min(1).max(120),
  lastName: z.string().min(1).max(120),
  middleName: z.string().max(120).optional().nullable(),
  serviceId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startAt: z.string().datetime(),
  branchId: z.string().uuid(),
  priority: z.enum(['NORMAL', 'URGENT', 'VIP']).optional().default('NORMAL'),
});
export type FastBookingDto = z.infer<typeof FastBookingSchema>;

export const IncomingCallSchema = z.object({
  phoneNumber: z.string().min(5).max(40),
  branchId: z.string().uuid(),
});
export type IncomingCallDto = z.infer<typeof IncomingCallSchema>;

export const InvoiceItemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
  performerEmployeeId: z.string().uuid().optional().nullable(),
});
export type InvoiceItemDto = z.infer<typeof InvoiceItemSchema>;

export const CreateInvoiceSchema = z.object({
  appointmentId: z.string().uuid().optional().nullable(),
  patientId: z.string().uuid(),
  branchId: z.string().uuid(),
  items: z.array(InvoiceItemSchema).min(1),
  discountAmount: z.number().min(0).optional().default(0),
});
export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;

export const PayInvoiceSchema = z.object({
  paymentMethod: z.string().min(1).max(40), // e.g. CASH, CARD, ONLINE, INSURED
});
export type PayInvoiceDto = z.infer<typeof PayInvoiceSchema>;
