import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Ticket, TicketSchema } from './schemas/ticket.schema';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { ClickUpClient } from './clickup.client';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ticket.name, schema: TicketSchema }]),
    ConfigModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, ClickUpClient],
  exports: [TicketsService, ClickUpClient],
})
export class TicketsModule {}
