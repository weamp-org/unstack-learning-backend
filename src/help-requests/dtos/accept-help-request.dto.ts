import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class AcceptHelpRequestDto {
  /** Meeting link pasted by the accepting teacher. Any platform works
   * (Zoom, Meet, etc) — links are manual until further notice.
   * @example 'https://zoom.us/j/123456789'
   */
  @ApiProperty({
    required: false,
    example: 'https://zoom.us/j/123456789',
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
