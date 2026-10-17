import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class AcceptHelpRequestDto {
  /** Meeting link posted by the accepting teacher (created by hand in v1).
   * @example 'https://meet.google.com/abc-defg-hij'
   */
  @ApiProperty({
    required: false,
    example: 'https://meet.google.com/abc-defg-hij',
  })
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  @IsOptional()
  sessionUrl?: string;

  /** When the session happens (ISO datetime).
   * @example '2026-10-25T14:00:00.000Z'
   */
  @ApiProperty({ required: false, example: '2026-10-25T14:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
