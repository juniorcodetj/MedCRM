import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '@core/cache/redis.module';

export const APPOINTMENT_REMINDERS_QUEUE = 'appointment-reminders';

@Injectable()
export class RemindersService implements OnModuleInit {
  private queue!: Queue;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.queue = new Queue(APPOINTMENT_REMINDERS_QUEUE, {
      connection: this.redis.duplicate({ maxRetriesPerRequest: null })
    });
  }

  async scheduleAppointmentReminder(appointmentId: string, startAt: Date): Promise<void> {
    const delay = Math.max(startAt.getTime() - Date.now() - 24 * 60 * 60 * 1000, 0);
    await this.queue.add(
      'appointment.reminder.24h',
      { appointmentId },
      { jobId: `${appointmentId}:24h`, delay, removeOnComplete: true, removeOnFail: 1000 }
    );
  }
}
