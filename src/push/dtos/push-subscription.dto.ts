import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PushSubscriptionKeysDto {
  @ApiProperty({ example: 'BNcRdreInn...' })
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty({ example: 'tBHItJI5sv...' })
  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class CreatePushSubscriptionDto {
  /** Push endpoint minted by the browser's push service. */
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc...' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @ApiProperty({ type: PushSubscriptionKeysDto })
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;

  /** Standard PushSubscription field; stored nowhere, accepted so a
   * verbatim PushManager subscription never trips forbidNonWhitelisted. */
  @ApiProperty({ required: false, example: null })
  @IsOptional()
  expirationTime?: number | null;
}

export class DeletePushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc...' })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  endpoint: string;
}
