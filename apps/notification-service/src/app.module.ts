import { Module } from '@nestjs/common';
import { FanoutModule } from './fanout/fanout.module';
import { ChannelsModule } from './channels/channels.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DeliveryModule } from './delivery/delivery.module';

@Module({
  imports: [FanoutModule, ChannelsModule, SchedulerModule, DeliveryModule],
})
export class AppModule {}
