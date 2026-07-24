import { Module } from '@nestjs/common';
import { PairingService } from './pairing.service';

/** 진입-청산 페어링 (8.5, SIG-018). */
@Module({
  providers: [PairingService],
  exports: [PairingService],
})
export class PairingModule {}
